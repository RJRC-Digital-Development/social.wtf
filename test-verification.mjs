import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

async function runTests() {
  console.log('--- TEST 1: Cookie Chain RPC Connectivity ---');
  const RPC_URL = 'https://rpc.cookiescan.io';
  const connection = new Connection(RPC_URL, 'confirmed');

  try {
    const slot = await connection.getSlot();
    const version = await connection.getVersion();
    console.log('✅ RPC is live! Current slot:', slot, 'Solana-core version:', version);
  } catch (err) {
    console.error('❌ RPC connection failed:', err);
    process.exit(1);
  }

  console.log('\n--- TEST 2: Automated 5% Protocol Fee Split Calculation ---');
  function calculateFeeSplit(totalCook, feePct = 5) {
    const totalLamports = BigInt(Math.round(totalCook * LAMPORTS_PER_SOL));
    const treasuryLamports = (totalLamports * BigInt(feePct)) / BigInt(100);
    const creatorLamports = totalLamports - treasuryLamports;
    return {
      totalCook,
      creatorCook: Number(creatorLamports) / LAMPORTS_PER_SOL,
      treasuryCook: Number(treasuryLamports) / LAMPORTS_PER_SOL,
      feePct,
    };
  }

  const testCases = [1.0, 2.5, 5.0, 10.0, 25.0, 100.0];
  for (const amt of testCases) {
    const split = calculateFeeSplit(amt, 5);
    const sum = split.creatorCook + split.treasuryCook;
    if (Math.abs(sum - amt) > 1e-9) {
      throw new Error(`Rounding discrepancy detected on ${amt}`);
    }
    console.log(
      `✅ Total: ${amt.toFixed(2)} COOK -> Creator (95%): ${split.creatorCook.toFixed(4)} COOK | Treasury (5%): ${split.treasuryCook.toFixed(4)} COOK`
    );
  }

  console.log('\n--- TEST 3: Zero-Trace Invisible Content Shielding Logic ---');
  const testPosts = [
    { id: '1', title: 'Clean Post', isShielded: false },
    { id: '2', title: 'Explicit Post 18+', isShielded: true },
    { id: '3', title: 'Audio Beat', isShielded: false },
  ];

  // Unverified Viewer test: restricted post must be completely omitted
  function filterPosts(posts, isAgeVerified, unshieldedMode) {
    if (isAgeVerified && unshieldedMode) return posts;
    return posts.filter((p) => !p.isShielded);
  }

  const unverifiedView = filterPosts(testPosts, false, false);
  if (unverifiedView.some((p) => p.isShielded)) {
    throw new Error('Shielded post leaked to unverified view!');
  }
  if (unverifiedView.length !== 2) {
    throw new Error('Unverified feed did not filter cleanly');
  }
  console.log('✅ Unverified feed contains 0 traces of shielded content. Total visible:', unverifiedView.length);

  const verifiedView = filterPosts(testPosts, true, true);
  if (verifiedView.length !== 3) {
    throw new Error('Verified unshielded feed did not reveal restricted post');
  }
  console.log('✅ Age-Verified unshielded feed reveals unlocked content. Total visible:', verifiedView.length);

  console.log('\n--- ALL ARCHITECTURAL TESTS PASSED SUCCESSFULLY! ---');
}

runTests();
