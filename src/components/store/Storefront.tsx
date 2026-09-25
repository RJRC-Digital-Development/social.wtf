'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product } from '@/types';
import { useWallet } from '@/lib/wallet/walletContext';
import { calculateFeeSplit } from '@/lib/solana/cookieChain';
import { TxStatusModal, TxStep } from '../transactions/TxStatusModal';
import { AssetDeliveryModal } from './AssetDeliveryModal';
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
  Shield,
  ShieldCheck,
  X,
  Edit3,
  Trash2,
  Check,
} from 'lucide-react';

interface StorefrontProps {
  products: Product[];
  creatorHandle?: string;
  onAddProduct?: (newProduct: Product) => void;
  onUpdateProduct?: (updatedProduct: Product) => void;
  onDeleteProduct?: (productId: string) => void;
  onPurchaseCompleted?: (product: Product, txSig: string) => void;
  onOpenVerifyModal?: (tab?: 'card_auth' | 'video_liveness' | 'id_upload') => void;
}

export const Storefront: React.FC<StorefrontProps> = ({
  products,
  creatorHandle,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onPurchaseCompleted,
}) => {
  const {
    connected,
    connect,
    signAndSendTransaction,
    cookBalance,
    walletAddress,
    sessionToken,
    isAuthenticated,
    authenticating,
    authenticateWallet,
  } = useWallet();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [purchasedProductIds, setPurchasedProductIds] = useState<string[]>([]);

  // Checkout modal
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>('idle');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txSig, setTxSig] = useState('');
  const [txError, setTxError] = useState('');

  // Asset Delivery Vault Modal
  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [deliveredProduct, setDeliveredProduct] = useState<Product | null>(null);
  const [deliveredSig, setDeliveredSig] = useState('');

  // Add Product modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState<number>(5.0);
  const [newCategory, setNewCategory] = useState<Product['category']>('digital_art');
  const [newFormat, setNewFormat] = useState('ZIP (.blend, .png)');
  const [newPreviewUrl, setNewPreviewUrl] = useState('');
  const [newDownloadUrl, setNewDownloadUrl] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  // Edit Product modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editPrice, setEditPrice] = useState<number>(5.0);
  const [editCategory, setEditCategory] = useState<Product['category']>('digital_art');
  const [editFormat, setEditFormat] = useState('');
  const [editPreviewUrl, setEditPreviewUrl] = useState('');
  const [editDownloadUrl, setEditDownloadUrl] = useState('');
  const [editFileSize, setEditFileSize] = useState('');
  const [editCodeSnippet, setEditCodeSnippet] = useState('');
  const [editFeatured, setEditFeatured] = useState(false);
  const [isUpdatingProduct, setIsUpdatingProduct] = useState(false);
  const [editError, setEditError] = useState('');
  const [isDeletingProductId, setIsDeletingProductId] = useState<string | null>(null);

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
      setDeliveredProduct(selectedProduct);
      setDeliveredSig(sig);
      if (onPurchaseCompleted) {
        onPurchaseCompleted(selectedProduct, sig);
      }
    } catch (err: any) {
      console.error(err);
      setTxError(err.message || 'Purchase failed or signature was rejected.');
      setTxStep('error');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setPublishError('');

    if (!newTitle.trim()) {
      setPublishError('Product title is required.');
      return;
    }

    if (!connected || !walletAddress) {
      setPublishError('Please connect your wallet to create and sell digital products.');
      return;
    }

    if (!isAuthenticated) {
      try {
        const success = await authenticateWallet();
        if (!success) {
          setPublishError('Please complete wallet authentication (SIWS) before listing products.');
          return;
        }
      } catch (authErr: any) {
        setPublishError(authErr?.message || 'Please complete wallet authentication (SIWS) before listing products.');
        return;
      }
    }

    setIsPublishing(true);

    try {
      const activeToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('social_wtf_session_token') : null);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (activeToken && activeToken.split('.').length === 3) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || 'Exclusive creator digital item.',
          priceCook: Number(newPrice),
          category: newCategory,
          fileFormat: newFormat,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 201 && data?.success && data?.product) {
        if (onAddProduct) {
          onAddProduct(data.product);
        }
        setShowAddModal(false);
        setNewTitle('');
        setNewDesc('');
        setPublishError('');
      } else if (res.status === 401) {
        setPublishError('Session expired or unauthorized. Please re-authenticate your wallet with SIWS.');
      } else if (res.status === 503) {
        setPublishError(data?.error || 'Authoritative product store is temporarily unavailable. Please retry.');
      } else {
        setPublishError(data?.error || 'Failed to publish product. Please check your inputs.');
      }
    } catch (err: any) {
      console.error('[Storefront] Product publication failure:', err);
      setPublishError('Network error connecting to product catalog service. Please retry.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleOpenEditProduct = (product: Product) => {
    setEditingProduct(product);
    setEditTitle(product.title);
    setEditDesc(product.description || '');
    setEditPrice(product.priceCook);
    setEditCategory(product.category);
    setEditFormat(product.fileFormat || '');
    setEditPreviewUrl(product.previewUrl || '');
    setEditDownloadUrl(product.downloadUrl || '');
    setEditFileSize(product.fileSize || '');
    setEditCodeSnippet(product.codeSnippet || '');
    setEditFeatured(Boolean(product.featured));
    setEditError('');
    setShowEditModal(true);
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editTitle.trim()) {
      setEditError('Product title is required.');
      return;
    }

    setIsUpdatingProduct(true);
    setEditError('');

    try {
      const activeToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('social_wtf_session_token') : null);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const res = await fetch('/api/products', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          id: editingProduct.id,
          title: editTitle.trim(),
          description: editDesc.trim() || 'Exclusive creator digital item.',
          priceCook: Number(editPrice),
          category: editCategory,
          fileFormat: editFormat || 'Digital',
          previewUrl: editPreviewUrl.trim() || undefined,
          downloadUrl: editDownloadUrl.trim() || undefined,
          fileSize: editFileSize.trim() || undefined,
          codeSnippet: editCodeSnippet.trim() || undefined,
          featured: editFeatured,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.product) {
        throw new Error(data?.error || 'Failed to update product');
      }

      if (onUpdateProduct) {
        onUpdateProduct(data.product);
      }
      setShowEditModal(false);
      setEditingProduct(null);
    } catch (err: any) {
      console.error('[Storefront] Update product error:', err);
      setEditError(err.message || 'Error updating product.');
    } finally {
      setIsUpdatingProduct(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to permanently remove this product from your storefront?')) {
      return;
    }

    setIsDeletingProductId(productId);
    try {
      const activeToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('social_wtf_session_token') : null);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id: productId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Failed to delete product');
      }

      if (onDeleteProduct) {
        onDeleteProduct(productId);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete product.');
    } finally {
      setIsDeletingProductId(null);
    }
  };

  const isProductOwner = (product: Product) => {
    return (
      (walletAddress && product.creatorWallet && walletAddress.toLowerCase() === product.creatorWallet.toLowerCase()) ||
      product.creatorHandle === 'you' ||
      (creatorHandle && product.creatorHandle === creatorHandle)
    );
  };

  const split = selectedProduct ? calculateFeeSplit(selectedProduct.priceCook) : null;

  return (
    <div className="space-y-6">
      {/* Category Pills and Add Product Button */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'All Digital Goods' },
            { id: 'code_script', label: 'Code & Developer Scripts' },
            { id: 'digital_art', label: '3D & Digital Art' },
            { id: 'music_stem', label: 'Music & Stems' },
            { id: 'vip_pass', label: 'VIP Passes' },
            { id: 'preset', label: 'Presets & LUTs' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-slate-700 border border-amber-300 dark:border-slate-700 text-amber-800 dark:text-amber-300 font-semibold text-xs transition-all shadow-sm"
        >
          <PlusCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>List New Product</span>
        </button>
      </div>

      {/* Product Grid */}
      {filteredProducts.length === 0 ? (
        <div className="p-12 rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/60 text-center space-y-4 transition-colors">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200">No Products Listed Yet</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
              List your digital goods, music stems, VIP passes, or presets to see on-chain Cookie Chain purchases in action.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:brightness-110 transition-all shadow-md shadow-amber-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            <span>List New Product</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredProducts.map((product) => {
            const isPurchased = purchasedProductIds.includes(product.id);

            return (
              <div
                key={product.id}
                className="rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 overflow-hidden shadow-sm dark:shadow-xl hover:border-slate-300 dark:hover:border-slate-600 transition-all flex flex-col justify-between group"
              >
                <div>
                  {/* Preview Image */}
                  <div className="relative aspect-video overflow-hidden bg-slate-100 dark:bg-black">
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
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base line-clamp-1 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">
                        {product.title}
                      </h3>
                      {isProductOwner(product) && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditProduct(product)}
                            title="Edit Product"
                            className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isDeletingProductId === product.id}
                            onClick={() => handleDeleteProduct(product.id)}
                            title="Delete Product"
                            className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                      {product.description}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono py-2 border-t border-slate-100 dark:border-slate-800/80">
                      <span>{product.fileSize || 'Instant DL'}</span>
                      <span>•</span>
                      <span>{product.fileFormat || 'Digital'}</span>
                      <span>•</span>
                      <span>{product.salesCount} sold</span>
                    </div>
                  </div>
                </div>

                {/* Purchase Footer */}
                <div className="p-5 pt-0">
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                        Cookie Chain Price
                      </span>
                      <span className="text-base font-bold font-mono text-amber-600 dark:text-amber-300">
                        {product.priceCook} COOK
                      </span>
                    </div>

                    {isPurchased ? (
                      <button
                        onClick={() => {
                          setDeliveredProduct(product);
                          setDeliveredSig(txSig || 'cook_tx_delivery_verified');
                          setDeliveryModalOpen(true);
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
      )}

      {/* Checkout Confirmation Modal */}
      {selectedProduct && split && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Checkout Digital Good</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Cookie Chain SVM Settlement</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                aria-label="Close checkout modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <h4 className="font-bold text-slate-900 dark:text-slate-200 text-sm">{selectedProduct.title}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{selectedProduct.description}</p>
            </div>

            {/* Split Breakdown */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 space-y-2 mb-5 text-xs">
              <div className="flex justify-between items-center text-slate-700 dark:text-slate-300">
                <span>Item Price:</span>
                <span className="font-bold font-mono text-amber-600 dark:text-amber-300 text-sm">
                  {selectedProduct.priceCook} COOK
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowFeeBreakdown(!showFeeBreakdown)}
                className="text-[10px] text-slate-400 hover:text-slate-300 flex items-center gap-1 pt-1 font-medium transition-colors"
              >
                <span>{showFeeBreakdown ? 'Hide' : 'View'} Settlement Details (0.05% fee)</span>
              </button>
              {showFeeBreakdown && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 text-[11px] animate-fade-in">
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>↳ Creator Proceeds (99.95%):</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      +{split.creatorAmount.toFixed(4)} COOK
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600 dark:text-slate-400">
                    <span>↳ Protocol Fee (0.05%):</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      +{split.treasuryAmount.toFixed(4)} COOK
                    </span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                const prod = selectedProduct;
                setSelectedProduct(null);
                handleExecuteCheckout();
              }}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-sm hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20"
            >
              Sign & Pay {selectedProduct.priceCook} COOK
            </button>

            <div className="mt-3 text-center text-[10px] text-slate-400 dark:text-slate-500">
              Digital asset purchase (99.95% to creator, 0.05% protocol sustainability fee).
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal for Creators */}
      {showAddModal && mounted && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
          className="fixed inset-0 z-[99999] overflow-y-auto bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fade-in"
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-8">
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/80 rounded-3xl p-6 shadow-2xl ring-1 ring-white/10 my-auto"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">List New Digital Asset</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Set price in $COOK with automated settlement</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                  aria-label="Close add product modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateProduct} className="space-y-3.5 text-xs">
                {/* SIWS Status Banner */}
                {isAuthenticated ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
                    <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                    <span>Wallet Verified & Authenticated (SIWS Active)</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-[11px]">SIWS cryptographic verification required to list products.</span>
                    </div>
                    {connected && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setPublishError('');
                            await authenticateWallet();
                          } catch (err: any) {
                            setPublishError(err?.message || 'Authentication challenge failed.');
                          }
                        }}
                        disabled={authenticating}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-all whitespace-nowrap active:scale-95"
                      >
                        {authenticating ? 'Signing...' : 'Sign SIWS'}
                      </button>
                    )}
                  </div>
                )}

                {publishError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed animate-fade-in space-y-2">
                    <div>{publishError}</div>
                    {!isAuthenticated && connected && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            setPublishError('');
                            const ok = await authenticateWallet();
                            if (ok) {
                              setPublishError('');
                            }
                          } catch (err: any) {
                            setPublishError(err?.message || 'Authentication challenge failed.');
                          }
                        }}
                        disabled={authenticating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-sm active:scale-95"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{authenticating ? 'Signing SIWS Challenge...' : 'Authenticate Wallet (SIWS)'}</span>
                      </button>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Product Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Master Synth Stem Pack Vol. 2"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="code_script">Code Snippet / Smart Contract / Script</option>
                    <option value="digital_art">3D Asset / Digital Art</option>
                    <option value="music_stem">Music WAV Stems / Audio</option>
                    <option value="vip_pass">VIP Access Pass / Token</option>
                    <option value="preset">Preset / LUT Pack</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">Price (in $COOK)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      required
                      value={newPrice}
                      onChange={(e) => setNewPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">File Format / Spec</label>
                    <input
                      type="text"
                      value={newFormat}
                      onChange={(e) => setNewFormat(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Describe your digital goods..."
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  When purchased: digital asset sales settle atomically and route directly to your connected creator wallet on Cookie Chain.
                </div>

                <button
                  type="submit"
                  disabled={isPublishing || authenticating}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                    isPublishing || authenticating
                      ? 'bg-amber-500/50 text-slate-700 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 active:scale-95'
                  }`}
                >
                  {isPublishing
                    ? 'Publishing to Authoritative Catalog...'
                    : authenticating
                    ? 'Authenticating Wallet...'
                    : 'Publish to Creator Storefront'}
                </button>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Product Modal */}
      {showEditModal && editingProduct && mounted && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditModal(false);
          }}
          className="fixed inset-0 z-[99999] overflow-y-auto bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fade-in"
        >
          <div className="min-h-full flex items-center justify-center py-4 sm:py-8">
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/80 rounded-3xl p-6 shadow-2xl ring-1 ring-white/10 my-auto"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Edit3 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Edit Digital Product</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Update listing details, pricing, and specs</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                  aria-label="Close edit product modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditProduct} className="space-y-3.5 text-xs">
                {editError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-semibold leading-relaxed animate-fade-in">
                    {editError}
                  </div>
                )}

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Product Title</label>
                  <input
                    type="text"
                    required
                    placeholder="Product Title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as any)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                  >
                    <option value="code_script">Code Snippet / Smart Contract / Script</option>
                    <option value="digital_art">3D Asset / Digital Art</option>
                    <option value="music_stem">Music WAV Stems / Audio</option>
                    <option value="vip_pass">VIP Access Pass / Token</option>
                    <option value="preset">Preset / LUT Pack</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">Price (in $COOK)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      required
                      value={editPrice}
                      onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 font-mono focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">File Format / Spec</label>
                    <input
                      type="text"
                      value={editFormat}
                      onChange={(e) => setEditFormat(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Description</label>
                  <textarea
                    rows={3}
                    placeholder="Describe your digital goods..."
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 mb-1">Preview Image URL (HTTPS / IPFS)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={editPreviewUrl}
                    onChange={(e) => setEditPreviewUrl(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={editFeatured}
                      onChange={(e) => setEditFeatured(e.target.checked)}
                      className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 w-4 h-4"
                    />
                    <span>Feature this product on storefront top banner</span>
                  </label>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingProduct}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all shadow-md shadow-amber-500/20 flex items-center gap-1.5"
                  >
                    {isUpdatingProduct ? (
                      <span>Saving...</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
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

      {/* Digital Asset Delivery & License Vault Modal */}
      <AssetDeliveryModal
        isOpen={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        product={deliveredProduct}
        txSignature={deliveredSig}
        walletAddress={walletAddress}
      />
    </div>
  );
};
