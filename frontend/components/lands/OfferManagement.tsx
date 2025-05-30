import React, { useState, useEffect } from 'react';
import { landOfferService, LandOffer } from '../../src/services/landOfferService';
import { useAuth } from '../../src/context/AuthContext';
import { FiCheck, FiX, FiClock, FiSend, FiDollarSign } from 'react-icons/fi';


type TabType = 'received' | 'sent';


const OfferManagement: React.FC = () => {
  const { currentUser, refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('received');
  const [receivedOffers, setReceivedOffers] = useState<LandOffer[]>([]);
  const [sentOffers, setSentOffers] = useState<LandOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingOffers, setProcessingOffers] = useState<Set<string>>(new Set());
  const [counterOfferModal, setCounterOfferModal] = useState<{
    isOpen: boolean;
    offer: LandOffer | null;
  }>({ isOpen: false, offer: null });

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    const unsubscribeReceived = landOfferService.subscribeToReceivedOffers(
      currentUser.uid,
      (offers) => {
        setReceivedOffers(offers);
        setLoading(false);
      }
    );

    const unsubscribeSent = landOfferService.subscribeToUserOffers(
      currentUser.uid,
      (offers) => {
        setSentOffers(offers);
      }
    );

    return () => {
      unsubscribeReceived();
      unsubscribeSent();
    };
  }, [currentUser]);
  const handleOfferResponse = async (offerId: string, response: 'accepted' | 'rejected') => {
    if (!currentUser) return;

    setProcessingOffers(prev => new Set(prev).add(offerId));

    try {
      const result = await landOfferService.respondToOffer(offerId, response, currentUser.uid);
      
      if (!result.success) {
        alert(result.message);
      } else if (result.landSaleCompleted) {
        // Refresh current user's profile since they just sold their land
        await refreshProfile();
      }
    } catch (error) {
      console.error('Error responding to offer:', error);
      alert('Failed to respond to offer. Please try again.');
    } finally {
      setProcessingOffers(prev => {
        const newSet = new Set(prev);
        newSet.delete(offerId);
        return newSet;
      });
    }
  };

  const handleCancelOffer = async (offerId: string) => {
    if (!currentUser) return;

    setProcessingOffers(prev => new Set(prev).add(offerId));

    try {
      const result = await landOfferService.cancelOffer(offerId, currentUser.uid);
      
      if (!result.success) {
        alert(result.message);
      }
    } catch (error) {
      console.error('Error cancelling offer:', error);
      alert('Failed to cancel offer. Please try again.');
    } finally {
      setProcessingOffers(prev => {
        const newSet = new Set(prev);
        newSet.delete(offerId);
        return newSet;
      });
    }
  };

  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeUntilExpiry = (expiresAt: any) => {
    if (!expiresAt) return '';
    const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    
    return `${hours}h ${minutes}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-400';
      case 'accepted': return 'text-green-400';
      case 'rejected': return 'text-red-400';
      case 'expired': return 'text-gray-400';
      case 'cancelled': return 'text-gray-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <FiClock className="text-yellow-400" />;
      case 'accepted': return <FiCheck className="text-green-400" />;
      case 'rejected': return <FiX className="text-red-400" />;
      case 'expired': return <FiClock className="text-gray-400" />;
      case 'cancelled': return <FiX className="text-gray-400" />;
      default: return <FiClock className="text-gray-400" />;
    }
  };

  const filteredReceivedOffers = receivedOffers.filter(offer => 
    activeTab === 'received'
  );

  const filteredSentOffers = sentOffers.filter(offer => 
    activeTab === 'sent'
  );

  const currentOffers = activeTab === 'received' ? filteredReceivedOffers : filteredSentOffers;

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Please log in to view your offers.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-4xl font-bold mb-8">Land Offers</h1>

        {/* Tabs */}
        <div className="flex mb-6 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('received')}
            className={`flex-1 py-3 px-4 rounded-lg transition-colors ${
              activeTab === 'received'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Received Offers ({receivedOffers.filter(o => o.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex-1 py-3 px-4 rounded-lg transition-colors ${
              activeTab === 'sent'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Sent Offers ({sentOffers.filter(o => o.status === 'pending').length})
          </button>
        </div>
        <div className="bg-gray-800 rounded-lg">
          {loading ? (
            <div className="p-8 text-center text-gray-400">
              Loading offers...
            </div>
          ) : currentOffers.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {activeTab === 'received' ? 'No offers received yet' : 'No offers sent yet'}
            </div>
          ) : (
            currentOffers.map((offer, index) => (
              <div
                key={offer.id}
                className={`p-6 ${
                  index !== currentOffers.length - 1 ? 'border-b border-gray-700' : ''
                } ${offer.status === 'pending' ? 'bg-gray-750' : ''}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(offer.status)}
                      <h3 className="text-lg font-semibold">
                        Land at ({offer.landCenterX}, {offer.landCenterY})
                      </h3>
                      <span className={`text-sm font-medium ${getStatusColor(offer.status)}`}>
                        {offer.status.charAt(0).toUpperCase() + offer.status.slice(1)}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
                      <div>
                        <p><strong>
                          {activeTab === 'received' ? 'From:' : 'To:'}
                        </strong> {activeTab === 'received' ? offer.fromUserDisplayName : offer.toUserDisplayName}</p>
                        <p><strong>Amount:</strong> {offer.offerAmount.toLocaleString()} 🪙</p>
                        <p><strong>Size:</strong> {offer.landSize}×{offer.landSize}</p>
                      </div>
                      <div>
                        <p><strong>Created:</strong> {formatTime(offer.createdAt)}</p>
                        {offer.status === 'pending' && (
                          <p><strong>Expires:</strong> {getTimeUntilExpiry(offer.expiresAt)}</p>
                        )}
                        {offer.respondedAt && (
                          <p><strong>Responded:</strong> {formatTime(offer.respondedAt)}</p>
                        )}
                      </div>
                    </div>

                    {offer.message && (
                      <div className="mt-3 p-3 bg-gray-700 rounded-lg">
                        <p className="text-sm text-gray-300">{offer.message}</p>
                      </div>
                    )}

                    {offer.counterOffer && (
                      <div className="mt-3 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                        <h4 className="text-sm font-semibold text-blue-300 mb-2">Counter Offer</h4>
                        <p className="text-sm text-gray-300">
                          <strong>Amount:</strong> {offer.counterOffer.amount.toLocaleString()} 🪙
                        </p>
                        {offer.counterOffer.message && (
                          <p className="text-sm text-gray-300 mt-1">{offer.counterOffer.message}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          {formatTime(offer.counterOffer.createdAt)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                {offer.status === 'pending' && (
                  <div className="flex gap-3 mt-4">
                    {activeTab === 'received' ? (
                      <>
                        <button
                          onClick={() => handleOfferResponse(offer.id, 'accepted')}
                          disabled={processingOffers.has(offer.id)}
                          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          <FiCheck size={16} />
                          Accept
                        </button>
                        <button
                          onClick={() => handleOfferResponse(offer.id, 'rejected')}
                          disabled={processingOffers.has(offer.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          <FiX size={16} />
                          Reject
                        </button>
                        <button
                          onClick={() => setCounterOfferModal({ isOpen: true, offer })}
                          disabled={processingOffers.has(offer.id)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          <FiDollarSign size={16} />
                          Counter
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleCancelOffer(offer.id)}
                          disabled={processingOffers.has(offer.id)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                          <FiX size={16} />
                          Cancel
                        </button>
                        {offer.counterOffer && (
                          <button
                            onClick={async () => {
                              setProcessingOffers(prev => new Set(prev).add(offer.id));
                              try {
                                const result = await landOfferService.acceptCounterOffer(offer.id, currentUser.uid);
                                if (!result.success) {
                                  alert(result.message);
                                }
                              } catch (error) {
                                console.error('Error accepting counter offer:', error);
                                alert('Failed to accept counter offer.');
                              } finally {
                                setProcessingOffers(prev => {
                                  const newSet = new Set(prev);
                                  newSet.delete(offer.id);
                                  return newSet;
                                });
                              }
                            }}
                            disabled={processingOffers.has(offer.id)}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                          >
                            <FiCheck size={16} />
                            Accept Counter
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}

                {processingOffers.has(offer.id) && (
                  <div className="mt-4 flex items-center gap-2 text-yellow-400">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-400"></div>
                    Processing...
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <CounterOfferModal
        isOpen={counterOfferModal.isOpen}
        offer={counterOfferModal.offer}
        onClose={() => setCounterOfferModal({ isOpen: false, offer: null })}
        onSuccess={() => {
          setCounterOfferModal({ isOpen: false, offer: null });
        }}
      />
    </div>
  );
};
interface CounterOfferModalProps {
  isOpen: boolean;
  offer: LandOffer | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CounterOfferModal: React.FC<CounterOfferModalProps> = ({
  isOpen,
  offer,
  onClose,
  onSuccess
}) => {
  const { currentUser } = useAuth();
  const [counterAmount, setCounterAmount] = useState<number>(0);
  const [counterMessage, setCounterMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (offer) {
      setCounterAmount(Math.round(offer.offerAmount * 1.2));
      setCounterMessage('');
      setError('');
    }
  }, [offer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser || !offer) return;

    if (counterAmount <= 0) {
      setError('Please enter a valid counter amount.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const result = await landOfferService.createCounterOffer(
        offer.id,
        counterAmount,
        counterMessage.trim(),
        currentUser.uid
      );

      if (result.success) {
        onSuccess();
      } else {
        setError(result.message);
      }
    } catch (error) {
      setError('Failed to send counter offer. Please try again.');
      console.error('Error making counter offer:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !offer) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Counter Offer</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FiX size={24} />
          </button>
        </div>

        <div className="mb-6">
          <div className="bg-gray-700 rounded-lg p-4 mb-4">
            <h3 className="text-white font-semibold mb-2">Original Offer</h3>
            <div className="text-gray-300 text-sm">
              <p>From: {offer.fromUserDisplayName}</p>
              <p>Amount: {offer.offerAmount.toLocaleString()} 🪙</p>
              <p>Land: ({offer.landCenterX}, {offer.landCenterY})</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Counter Amount (🪙)
            </label>
            <input
              type="number"
              value={counterAmount || ''}
              onChange={(e) => setCounterAmount(parseInt(e.target.value) || 0)}
              min="1"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter counter amount..."
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Message (Optional)
            </label>
            <textarea
              value={counterMessage}
              onChange={(e) => setCounterMessage(e.target.value)}
              maxLength={200}
              rows={3}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Explain your counter offer..."
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || counterAmount <= 0}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <FiSend size={16} />
                  Send Counter
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default OfferManagement;