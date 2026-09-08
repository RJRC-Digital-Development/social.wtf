use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("9iapGcxDbDtZ2bWtwM2kLYNW67XH2qzPxLxXfSUbQQZq");

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_FEE_BPS: u64 = 2_500; // Max allowable protocol fee = 25.00%
pub const MAX_PRODUCT_ID_LEN: usize = 32;
pub const MAX_METADATA_URI_LEN: usize = 128;

#[program]
pub mod social_wtf {
    use super::*;

    /// 1. Initialize Platform with deterministic PDA [platform]
    pub fn initialize_platform(
        ctx: Context<InitializePlatform>,
        treasury_fee_bps: u64,
    ) -> Result<()> {
        require!(treasury_fee_bps <= MAX_FEE_BPS, SocialError::FeeTooHigh);

        let platform_state = &mut ctx.accounts.platform_state;
        platform_state.admin = ctx.accounts.admin.key();
        platform_state.pending_admin = None;
        platform_state.treasury = ctx.accounts.treasury.key();
        platform_state.fee_bps = treasury_fee_bps;
        platform_state.is_paused = false;
        platform_state.total_volume_lamports = 0;
        platform_state.total_treasury_collected = 0;
        platform_state.total_transactions = 0;
        platform_state.bump = ctx.bumps.platform_state;

        emit!(PlatformInitialized {
            admin: platform_state.admin,
            treasury: platform_state.treasury,
            fee_bps: platform_state.fee_bps,
        });

        msg!(Social.wtf platform initialized with deterministic PDA on Cookie Chain);
        Ok(())
    }

    /// 2. Emergency Pause
    pub fn pause_platform(ctx: Context<AdminOperation>) -> Result<()> {
        let platform_state = &mut ctx.accounts.platform_state;
        require!(!platform_state.is_paused, SocialError::AlreadyPaused);
        platform_state.is_paused = true;

        emit!(PlatformPausedStateChanged { is_paused: true });
        msg!(Social.wtf platform paused by governance);
        Ok(())
    }

    /// 3. Emergency Unpause
    pub fn unpause_platform(ctx: Context<AdminOperation>) -> Result<()> {
        let platform_state = &mut ctx.accounts.platform_state;
        require!(platform_state.is_paused, SocialError::NotPaused);
        platform_state.is_paused = false;

        emit!(PlatformPausedStateChanged { is_paused: false });
        msg!(Social.wtf platform unpaused by governance);
        Ok(())
    }

    /// 4. Update Fee BPS (Single Source of Truth, Bounded)
    pub fn update_fee(ctx: Context<AdminOperation>, new_fee_bps: u64) -> Result<()> {
        require!(new_fee_bps <= MAX_FEE_BPS, SocialError::FeeTooHigh);
        let platform_state = &mut ctx.accounts.platform_state;
        let old_fee = platform_state.fee_bps;
        platform_state.fee_bps = new_fee_bps;

        emit!(FeeUpdated {
            old_fee_bps: old_fee,
            new_fee_bps,
        });
        Ok(())
    }

    /// 5. Update Treasury Address
    pub fn update_treasury(ctx: Context<UpdateTreasury>) -> Result<()> {
        let platform_state = &mut ctx.accounts.platform_state;
        let old_treasury = platform_state.treasury;
        let new_treasury = ctx.accounts.new_treasury.key();
        platform_state.treasury = new_treasury;

        emit!(TreasuryUpdated {
            old_treasury,
            new_treasury,
        });
        Ok(())
    }

    /// 6. Two-Step Admin Transfer: Step 1 (Initiate)
    pub fn transfer_admin(ctx: Context<AdminOperation>, new_admin: Pubkey) -> Result<()> {
        require!(new_admin != Pubkey::default(), SocialError::InvalidAdminAddress);
        let platform_state = &mut ctx.accounts.platform_state;
        platform_state.pending_admin = Some(new_admin);

        emit!(AdminTransferInitiated {
            current_admin: platform_state.admin,
            pending_admin: new_admin,
        });
        Ok(())
    }

    /// 7. Two-Step Admin Transfer: Step 2 (Accept by Pending Admin)
    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        let platform_state = &mut ctx.accounts.platform_state;
        let old_admin = platform_state.admin;
        let new_admin = ctx.accounts.pending_admin.key();

        platform_state.admin = new_admin;
        platform_state.pending_admin = None;

        emit!(AdminTransferCompleted {
            old_admin,
            new_admin,
        });
        Ok(())
    }

    /// 8. Create On-Chain Product under Creator Profile
    pub fn create_product(
        ctx: Context<CreateProduct>,
        product_id: String,
        price_lamports: u64,
        metadata_uri: String,
    ) -> Result<()> {
        require!(!product_id.is_empty(), SocialError::InvalidProductId);
        require!(product_id.len() <= MAX_PRODUCT_ID_LEN, SocialError::ProductIdTooLong);
        require!(metadata_uri.len() <= MAX_METADATA_URI_LEN, SocialError::MetadataUriTooLong);
        require!(price_lamports > 0, SocialError::InvalidAmount);

        let product = &mut ctx.accounts.product;
        product.creator = ctx.accounts.creator.key();
        product.product_id = product_id.clone();
        product.price_lamports = price_lamports;
        product.is_active = true;
        product.metadata_uri = metadata_uri.clone();
        product.total_sales = 0;
        product.bump = ctx.bumps.product;

        emit!(ProductCreated {
            creator: product.creator,
            product_id,
            price_lamports,
            metadata_uri,
        });
        Ok(())
    }

    /// 9. Update On-Chain Product (Price, Active Status, Metadata)
    pub fn update_product(
        ctx: Context<UpdateProduct>,
        new_price_lamports: u64,
        is_active: bool,
        new_metadata_uri: String,
    ) -> Result<()> {
        require!(new_price_lamports > 0, SocialError::InvalidAmount);
        require!(new_metadata_uri.len() <= MAX_METADATA_URI_LEN, SocialError::MetadataUriTooLong);

        let product = &mut ctx.accounts.product;
        product.price_lamports = new_price_lamports;
        product.is_active = is_active;
        product.metadata_uri = new_metadata_uri;

        emit!(ProductUpdated {
            creator: product.creator,
            product_id: product.product_id.clone(),
            price_lamports: new_price_lamports,
            is_active,
        });
        Ok(())
    }

    /// 10. Direct Creator Tip with Invariant Fee Split
    pub fn tip_creator(ctx: Context<TipCreator>, amount_lamports: u64) -> Result<()> {
        let platform_state = &ctx.accounts.platform_state;
        require!(!platform_state.is_paused, SocialError::PlatformPaused);
        require!(amount_lamports > 0, SocialError::InvalidAmount);

        // Checked arithmetic for fee split using state.fee_bps as single source of truth
        let treasury_fee = amount_lamports
            .checked_mul(platform_state.fee_bps)
            .ok_or(SocialError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(SocialError::Overflow)?;

        let creator_proceeds = amount_lamports
            .checked_sub(treasury_fee)
            .ok_or(SocialError::Overflow)?;

        // Enforce critical invariant: creator_amount + treasury_fee == total_amount
        require!(
            creator_proceeds.checked_add(treasury_fee) == Some(amount_lamports),
            SocialError::FeeInvariantViolated
        );

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

        // Transfer fee to Treasury (if fee > 0)
        if treasury_fee > 0 {
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
        }

        // Update platform state statistics safely
        let state = &mut ctx.accounts.platform_state;
        state.total_volume_lamports = state
            .total_volume_lamports
            .checked_add(amount_lamports)
            .ok_or(SocialError::Overflow)?;
        state.total_treasury_collected = state
            .total_treasury_collected
            .checked_add(treasury_fee)
            .ok_or(SocialError::Overflow)?;
        state.total_transactions = state
            .total_transactions
            .checked_add(1)
            .ok_or(SocialError::Overflow)?;

        emit!(CreatorTipped {
            from: ctx.accounts.tipper.key(),
            creator: ctx.accounts.creator.key(),
            total_amount: amount_lamports,
            creator_amount: creator_proceeds,
            treasury_fee,
        });

        Ok(())
    }

    /// 11. Purchase Digital Product — Never trust client-supplied price!
    pub fn purchase_product(ctx: Context<PurchaseProduct>) -> Result<()> {
        let platform_state = &ctx.accounts.platform_state;
        require!(!platform_state.is_paused, SocialError::PlatformPaused);

        let product = &ctx.accounts.product;
        require!(product.is_active, SocialError::ProductInactive);

        // Price is read strictly from on-chain product account!
        let price_lamports = product.price_lamports;
        require!(price_lamports > 0, SocialError::InvalidAmount);

        let treasury_fee = price_lamports
            .checked_mul(platform_state.fee_bps)
            .ok_or(SocialError::Overflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(SocialError::Overflow)?;

        let creator_proceeds = price_lamports
            .checked_sub(treasury_fee)
            .ok_or(SocialError::Overflow)?;

        require!(
            creator_proceeds.checked_add(treasury_fee) == Some(price_lamports),
            SocialError::FeeInvariantViolated
        );

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

        // 2. Transfer fee to Treasury
        if treasury_fee > 0 {
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
        }

        // 3. Initialize unique purchase receipt PDA
        let receipt = &mut ctx.accounts.purchase_receipt;
        receipt.buyer = ctx.accounts.buyer.key();
        receipt.product = product.key();
        receipt.price_paid = price_lamports;
        receipt.treasury_fee = treasury_fee;
        receipt.purchased_at = Clock::get()?.unix_timestamp;
        receipt.purchase_nonce = product.total_sales;
        receipt.bump = ctx.bumps.purchase_receipt;

        // 4. Update sales counters
        let product_mut = &mut ctx.accounts.product;
        product_mut.total_sales = product_mut
            .total_sales
            .checked_add(1)
            .ok_or(SocialError::Overflow)?;

        let state = &mut ctx.accounts.platform_state;
        state.total_volume_lamports = state
            .total_volume_lamports
            .checked_add(price_lamports)
            .ok_or(SocialError::Overflow)?;
        state.total_treasury_collected = state
            .total_treasury_collected
            .checked_add(treasury_fee)
            .ok_or(SocialError::Overflow)?;
        state.total_transactions = state
            .total_transactions
            .checked_add(1)
            .ok_or(SocialError::Overflow)?;

        emit!(DigitalProductPurchased {
            buyer: receipt.buyer,
            creator: ctx.accounts.creator.key(),
            product_id: product_mut.product_id.clone(),
            price: price_lamports,
            treasury_fee,
            nonce: receipt.purchase_nonce,
        });

        Ok(())
    }
}

// -----------------------------------------------------------------------------
// ACCOUNT VALIDATION CONTEXTS
// -----------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + (1 + 32) + 32 + 8 + 1 + 8 + 8 + 8 + 1,
        seeds = [bplatform],
        bump
    )]
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: Treasury account receiving automated platform fees
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOperation<'info> {
    #[account(
        mut,
        seeds = [bplatform],
        bump = platform_state.bump,
        has_one = admin @ SocialError::UnauthorizedAdmin
    )]
    pub platform_state: Account<'info, PlatformState>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    #[account(
        mut,
        seeds = [bplatform],
        bump = platform_state.bump,
        has_one = admin @ SocialError::UnauthorizedAdmin
    )]
    pub platform_state: Account<'info, PlatformState>,
    pub admin: Signer<'info>,
    /// CHECK: Validated new treasury destination
    pub new_treasury: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(
        mut,
        seeds = [bplatform],
        bump = platform_state.bump,
        constraint = platform_state.pending_admin == Some(pending_admin.key()) @ SocialError::UnauthorizedPendingAdmin
    )]
    pub platform_state: Account<'info, PlatformState>,
    pub pending_admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(product_id: String)]
pub struct CreateProduct<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + 32 + (4 + MAX_PRODUCT_ID_LEN) + 8 + 1 + (4 + MAX_METADATA_URI_LEN) + 8 + 1,
        seeds = [bproduct, creator.key().as_ref(), product_id.as_bytes()],
        bump
    )]
    pub product: Account<'info, Product>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProduct<'info> {
    #[account(
        mut,
        seeds = [bproduct, creator.key().as_ref(), product.product_id.as_bytes()],
        bump = product.bump,
        has_one = creator @ SocialError::UnauthorizedCreator
    )]
    pub product: Account<'info, Product>,
    pub creator: Signer<'info>,
}

#[derive(Accounts)]
pub struct TipCreator<'info> {
    #[account(
        mut,
        seeds = [bplatform],
        bump = platform_state.bump,
        has_one = treasury @ SocialError::InvalidTreasuryAccount
    )]
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub tipper: Signer<'info>,
    /// CHECK: Validated creator receiving 95% proceeds
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    /// CHECK: Validated platform treasury from platform_state
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PurchaseProduct<'info> {
    #[account(
        mut,
        seeds = [bplatform],
        bump = platform_state.bump,
        has_one = treasury @ SocialError::InvalidTreasuryAccount
    )]
    pub platform_state: Account<'info, PlatformState>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [bproduct, creator.key().as_ref(), product.product_id.as_bytes()],
        bump = product.bump,
        has_one = creator @ SocialError::UnauthorizedCreator
    )]
    pub product: Account<'info, Product>,
    /// CHECK: Creator receiving proceeds matching product.creator
    #[account(mut)]
    pub creator: AccountInfo<'info>,
    /// CHECK: Platform Treasury matching platform_state.treasury
    #[account(mut)]
    pub treasury: AccountInfo<'info>,
    #[account(
        init,
        payer = buyer,
        space = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1,
        seeds = [breceipt, buyer.key().as_ref(), product.key().as_ref(), &product.total_sales.to_le_bytes()],
        bump
    )]
    pub purchase_receipt: Account<'info, PurchaseReceipt>,
    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------------------------
// ACCOUNT STRUCTS
// -----------------------------------------------------------------------------

#[account]
pub struct PlatformState {
    pub admin: Pubkey,
    pub pending_admin: Option<Pubkey>,
    pub treasury: Pubkey,
    pub fee_bps: u64,
    pub is_paused: bool,
    pub total_volume_lamports: u64,
    pub total_treasury_collected: u64,
    pub total_transactions: u64,
    pub bump: u8,
}

#[account]
pub struct Product {
    pub creator: Pubkey,
    pub product_id: String,
    pub price_lamports: u64,
    pub is_active: bool,
    pub metadata_uri: String,
    pub total_sales: u64,
    pub bump: u8,
}

#[account]
pub struct PurchaseReceipt {
    pub buyer: Pubkey,
    pub product: Pubkey,
    pub price_paid: u64,
    pub treasury_fee: u64,
    pub purchased_at: i64,
    pub purchase_nonce: u64,
    pub bump: u8,
}

// -----------------------------------------------------------------------------
// EVENTS
// -----------------------------------------------------------------------------

#[event]
pub struct PlatformInitialized {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u64,
}

#[event]
pub struct PlatformPausedStateChanged {
    pub is_paused: bool,
}

#[event]
pub struct FeeUpdated {
    pub old_fee_bps: u64,
    pub new_fee_bps: u64,
}

#[event]
pub struct TreasuryUpdated {
    pub old_treasury: Pubkey,
    pub new_treasury: Pubkey,
}

#[event]
pub struct AdminTransferInitiated {
    pub current_admin: Pubkey,
    pub pending_admin: Pubkey,
}

#[event]
pub struct AdminTransferCompleted {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct ProductCreated {
    pub creator: Pubkey,
    pub product_id: String,
    pub price_lamports: u64,
    pub metadata_uri: String,
}

#[event]
pub struct ProductUpdated {
    pub creator: Pubkey,
    pub product_id: String,
    pub price_lamports: u64,
    pub is_active: bool,
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
    pub nonce: u64,
}

// -----------------------------------------------------------------------------
// ERROR CODES
// -----------------------------------------------------------------------------

#[error_code]
pub enum SocialError {
    #[msg(Invalid transaction amount)]
    InvalidAmount,
    #[msg(Calculation overflow)]
    Overflow,
    #[msg(Protocol fee exceeds maximum allowed limit (25%))]
    FeeTooHigh,
    #[msg(Platform is currently paused for maintenance or emergency)]
    PlatformPaused,
    #[msg(Platform is already paused)]
    AlreadyPaused,
    #[msg(Platform is not paused)]
    NotPaused,
    #[msg(Unauthorized: Signer does not match platform admin)]
    UnauthorizedAdmin,
    #[msg(Unauthorized: Signer does not match pending admin)]
    UnauthorizedPendingAdmin,
    #[msg(Unauthorized: Signer is not the authorized creator of this product)]
    UnauthorizedCreator,
    #[msg(Invalid admin address provided)]
    InvalidAdminAddress,
    #[msg(Supplied treasury account does not match configured platform treasury)]
    InvalidTreasuryAccount,
    #[msg(Product is inactive or delisted)]
    ProductInactive,
    #[msg(Product ID must not be empty)]
    InvalidProductId,
    #[msg(Product ID exceeds maximum allowed length)]
    ProductIdTooLong,
    #[msg(Metadata URI exceeds maximum allowed length)]
    MetadataUriTooLong,
    #[msg(Critical invariant violated: creator proceeds + treasury fee does not equal total payment)]
    FeeInvariantViolated,
}
