'use client';

import React, { useState } from 'react';
import { Product } from '@/types';
import { useWallet } from '@/lib/wallet/walletContext';
import { calculateFeeSplit, COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import { TxStatusModal, TxStep } from '../transactions/TxStatusModal';
import {
  ShoppingBag,
  Download,
  CheckCircle2,
  Sparkles,
  Tag,
  FileCode,
  Layers,
  Music,
  PlusCircle,
  ExternalLink,
} from 'lucide-react';

interface StorefrontProps {
  products: Product[];
  creatorHandle?: string;
  onAddProduct?: (newProduct: Product) => void;
}

export const Storefront: React.FC<StorefrontProps> = ({
  products,
  creatorHandle,
  onAddProduct,
}) => {
  const { connected, connect, signAndSendTransaction, cookBalance } = useWallet();

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [purchasedProductIds, setPurchasedProductIds] = useState<string[]>([]);

  // Checkout modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [txStep, setTxStep] = useState<TxStep>('idle');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txSig, setTxSig] = useState('');
  const [txError, setTxError] = useState('');

  // Add Product modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState<number>(5.0);
  const [newCategory, setNewCategory] = useState<Product['category']>('digital_art');
  const [newFormat, setNewFormat] = useState('ZIP (.blend, .png)');

  const filteredProducts = products.filter((p) => {
    if (creatorHandle && p.creatorHandle !== creatorHandle) return false;
    if (selectedCategory === 'all') return true;
    return p.category === selectedCategory;
  });

  const handleBuyProduct = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleExecuteCheckout = async () => {
    if (!selectedProduct) return;

    if (!connected) {
      await connect('nightly');
      return;
    }

    setTxModalOpen(true);
    setTxStep('preparing');

    try {
      await new Promise((r) => setTimeout(r, 600));
      setTxStep('signing');

      setTxStep('broadcasting');
      const sig = await signAndSendTransaction({
        to: selectedProduct.creatorWallet,
        amount: selectedProduct.priceCook,
        action: 'store_purchase',
        productId: selectedProduct.id,
      });

      setTxSig(sig);
      setTxStep('confirmed');
      setPurchasedProductIds((prev) => [...prev, selectedProduct.id]);
    } catch (err: any) {
      console.error(err);
      setTxError(err.message || 'Purchase failed or signature was rejected.');
      setTxStep('error');
    }
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newProd: Product = {
      id: `prod-${Date.now()}`,
      creatorId: 'you',
      creatorHandle: 'cryptobaker',
      creatorName: 'The Cookie Baker 🍪',
      creatorWallet: 'CookBaker77777777777777777777777777777777',
      title: newTitle.trim(),
      description: newDesc.trim() || 'Exclusive creator digital item.',
      priceCook: Number(newPrice),
      category: newCategory,
      previewUrl:
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
      salesCount: 0,
      fileSize: '24.5 MB',
      fileFormat: newFormat,
      featured: true,
    };

    if (onAddProduct) {
      onAddProduct(newProd);
    }
    setShowAddModal(false);
    setNewTitle('');
    setNewDesc('');
  };

  const split = selectedProduct ? calculateFeeSplit(selectedProduct.priceCook) : null;

  return (
    <div className="space-y-6">
      {/* Category Pills and Add Product Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'All Digital Goods' },
            { id: 'digital_art', label: '🎨 3D & Digital Art' },
            { id: 'music_stem', label: '🎧 Music & Stems' },
            { id: 'vip_pass', label: '🎟️ VIP Passes' },
            { id: 'preset', label: '📸 Presets & LUTs' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                  : 'bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-semibold text-xs transition-all shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          <span>List New Product</span>
        </button>
      </div>

      {/* Product Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredProducts.map((product) => {
          const isPurchased = purchasedProductIds.includes(product.id);

          return (
            <div
              key={product.id}
              className="rounded-3xl bg-[#0d1527] border border-slate-700/70 overflow-hidden shadow-xl hover:border-slate-600 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Preview Image */}
                <div className="relative aspect-video overflow-hidden bg-black">
                  <img
                    src={product.previewUrl}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-sm border border-slate-700 text-[10px] font-bold text-amber-300 uppercase tracking-wider">
                    {product.category.replace('_', ' ')}
                  </div>
                  {isPurchased && (
                    <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-emerald-500/90 text-slate-950 text-[10px] font-bold flex items-center gap-1 shadow-lg">
                      <CheckCircle2 className="w-3.5 h-3.5" /> OWNED
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="p-5">
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <h3 className="font-bold text-slate-100 text-base line-clamp-1 group-hover:text-amber-300 transition-colors">
                      {product.title}
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                    {product.description}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono py-2 border-t border-slate-800/80">
                    <span>📦 {product.fileSize || 'Instant DL'}</span>
                    <span>•</span>
                    <span>📑 {product.fileFormat || 'Digital'}</span>
                    <span>•</span>
                    <span>⚡ {product.salesCount} sold</span>
                  </div>
                </div>
              </div>

              {/* Purchase Footer */}
              <div className="p-5 pt-0">
                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                      Cookie Chain Price
                    </span>
                    <span className="text-base font-bold font-mono text-amber-300">
                      {product.priceCook} COOK
                    </span>
                  </div>

                  {isPurchased ? (
                    <button
                      onClick={() => {
                        alert(
                          `Unlocking encrypted asset: ${product.title}\nFormat: ${product.fileFormat}\nValid transaction confirmed on Cookie Chain.`
                        );
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Asset</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuyProduct(product)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 text-slate-950 text-xs font-bold hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>Buy with COOK</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Checkout Confirmation Modal */}
      {selectedProduct && split && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm bg-[#0d1527] border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">Checkout Digital Good</h3>
                  <p className="text-[11px] text-slate-400">Cookie Chain SVM Settlement</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mb-4">
              <h4 className="font-bold text-slate-200 text-sm">{selectedProduct.title}</h4>
              <p className="text-xs text-slate-400 mt-1">{selectedProduct.description}</p>
            </div>

            {/* Split Breakdown */}
            <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2 mb-5 text-xs">
              <div className="flex justify-between items-center text-slate-300">
                <span>Item Price:</span>
                <span className="font-bold font-mono text-amber-300 text-sm">
                  {selectedProduct.priceCook} COOK
                </span>
              </div>
              <div className="pt-2 border-t border-slate-800 space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>↳ Creator Cut (95%):</span>
                  <span className="font-mono text-emerald-400">
                    +{split.creatorAmount.toFixed(3)} COOK
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>↳ Social.wtf Treasury (5%):</span>
                  <span className="font-mono text-blue-400">
                    +{split.treasuryAmount.toFixed(3)} COOK
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                const prod = selectedProduct;
                setSelectedProduct(null);
                handleExecuteCheckout();
              }}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-sm hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-amber-500/20"
            >
              Sign & Pay {selectedProduct.priceCook} COOK
            </button>
          </div>
        </div>
      )}

      {/* Add Product Modal for Creators */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-[#0d1527] border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">List New Digital Asset</h3>
                  <p className="text-[11px] text-slate-400">Set price in $COOK with 5% treasury split</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Product Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Master Synth Stem Pack Vol. 2"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="digital_art">3D Asset / Digital Art</option>
                  <option value="music_stem">Music WAV Stems / Audio</option>
                  <option value="vip_pass">VIP Access Pass / Token</option>
                  <option value="preset">Preset / LUT Pack</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Price (in $COOK)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0.1)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">File Format / Spec</label>
                  <input
                    type="text"
                    value={newFormat}
                    onChange={(e) => setNewFormat(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe your digital goods..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                When purchased: <span className="text-emerald-400 font-semibold">95%</span> routes directly to your wallet, and <span className="text-blue-400 font-semibold">5%</span> funds the platform treasury on Cookie Chain.
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20"
              >
                Publish to Creator Storefront
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Status Modal */}
      <TxStatusModal
        isOpen={txModalOpen}
        step={txStep}
        actionTitle="Storefront Purchase"
        signature={txSig}
        errorMessage={txError}
        totalAmountCook={selectedProduct?.priceCook}
        creatorAmountCook={split?.creatorAmount}
        treasuryAmountCook={split?.treasuryAmount}
        recipientName={selectedProduct?.creatorName}
        onClose={() => setTxModalOpen(false)}
        onRetry={handleExecuteCheckout}
      />
    </div>
  );
};
