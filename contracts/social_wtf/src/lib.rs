use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("CookSocial111111111111111111111111111111111");

pub const PROTOCOL_FEE_BPS: u64 = 500; // 5.00%
pub const BPS_DENOMINATOR: u64 = 10_000;

#[program]
pub mod social_wtf {
    use super::*;

    /// Initialize the Social.wtf global configuration on Cookie Chain
    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        treasury_fee_bps: u64,
    ) -> Result<()> {
        let platform_state = &mut ctx.accounts.platform_state;
        platform_state.admin = ctx.accounts.admin.key();
        platform_state.treasury = ctx.accounts.treasury.key();
        platform_state.fee_bps = treasury_fee_bps;
        platform_state.total_volume_lamports = 0;
        platform_state.total_treasury_collected = 0;
        platform_state.total_transactions = 0;

        msg!("Social.wtf platform initialized on Cookie Chain (SVM)");
        Ok(())
    }

    /// Direct Creator Tip with automated 5% fee split to Social.wtf Treasury
    pub fn tip_creator(ctx: Context<TipCreator>, amount_lamports: u64) -> Result<()> {
        require!(amount_lamports > 0, SocialError::InvalidAmount);

        // Compute 5% platform fee split
        let treasury_fee = (amount_lamports * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        let creator_proceeds = amount_lamports - treasury_fee;

        // Transfer 95% proceeds to creator
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.tipper.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
            ),
            creator_proceeds,
        )?;

        // Transfer 5% automated protocol fee to Social.wtf Treasury
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.tipper.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            treasury_fee,
        )?;

        let state = &mut ctx.accounts.platform_state;
        state.total_volume_lamports += amount_lamports;
        state.total_treasury_collected += treasury_fee;
        state.total_transactions += 1;

        emit!(CreatorTipped {
            from: ctx.accounts.tipper.key(),
            creator: ctx.accounts.creator.key(),
            total_amount: amount_lamports,
            creator_amount: creator_proceeds,
            treasury_fee,
        });

        Ok(())
    }

    /// Purchase digital goods from creator storefront with automated 5% fee split
    pub fn purchase_digital_product(
        ctx: Context<PurchaseProduct>,
        product_id: String,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, SocialError::InvalidAmount);

        let treasury_fee = (amount_lamports * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        let creator_proceeds = amount_lamports - treasury_fee;

        // 1. Transfer to Creator
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.creator.to_account_info(),
                },
            ),
            creator_proceeds,
        )?;

        // 2. Transfer automated 5% protocol cut to Treasury
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            treasury_fee,
        )?;

        // 3. Record purchase receipt PDA
        let receipt = &mut ctx.accounts.purchase_receipt;
        receipt.buyer = ctx.accounts.buyer.key();
        receipt.creator = ctx.accounts.creator.key();
        receipt.product_id = product_id.clone();
        receipt.price_paid = amount_lamports;
        receipt.treasury_fee = treasury_fee;
        receipt.purchased_at = Clock::get()?.unix_timestamp;

        let state = &mut ctx.accounts.platform_state;
        state.total_volume_lamports += amount_lamports;
        state.total_treasury_collected += treasury_fee;
        state.total_transactions += 1;

        emit!(DigitalProductPurchased {
            buyer: ctx.accounts.buyer.key(),
            creator: ctx.accounts.creator.key(),
            product_id,
            price: amount_lamports,
            treasury_fee,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8
    )]
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Treasury account receiving automated 5% protocol fee
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TipCreator<'info> {
    #[account(mut)]
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: Creator receiving 95% tip
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    /// CHECK: Platform Treasury
    #[account(mut, address = platform_state.treasury)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(product_id: String)]
pub struct PurchaseProduct<'info> {
    #[account(mut)]
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: Storefront creator receiving 95%
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    /// CHECK: Platform Treasury
    #[account(mut, address = platform_state.treasury)]
    pub treasury: AccountInfo<'info>,
    #[account(
        init,
        payer = buyer,
        space = 8 + 32 + 32 + 64 + 8 + 8 + 8,
        seeds = [b"receipt", buyer.key().as_ref(), product_id.as_bytes()],
        bump
    )]
    pub purchase_receipt: Account<'info, PurchaseReceipt>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PlatformState {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u64,
    pub total_volume_lamports: u64,
    pub total_treasury_collected: u64,
    pub total_transactions: u64,
}

#[account]
pub struct PurchaseReceipt {
    pub buyer: Pubkey,
    pub creator: Pubkey,
    pub product_id: String,
    pub price_paid: u64,
    pub treasury_fee: u64,
    pub purchased_at: i64,
}

#[event]
pub struct CreatorTipped {
    pub from: Pubkey,
    pub creator: Pubkey,
    pub total_amount: u64,
    pub creator_amount: u64,
    pub treasury_fee: u64,
}

#[event]
pub struct DigitalProductPurchased {
    pub buyer: Pubkey,
    pub creator: Pubkey,
    pub product_id: String,
    pub price: u64,
    pub treasury_fee: u64,
}

#[error_code]
pub enum SocialError {
    #[msg("Invalid transaction amount")]
    InvalidAmount,
    #[msg("Calculation overflow")]
    Overflow,
}
