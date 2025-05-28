import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../src/context/AuthContext';
import { ref, push, onValue, remove, update, get } from 'firebase/database';
import { db } from '../src/firebaseClient';
import { economyService } from '../src/services/economyService';
import { useEconomy } from '../src/context/EconomyContext';

interface GalleryPost {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  title: string;
  description: string;
  timestamp: number;
  likes: { [userId: string]: boolean };
  comments: { [commentId: string]: Comment };
}

interface Comment {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

type SortOption = 'recent' | 'likes' | 'comments' | 'oldest';

const Gallery: React.FC = () => {
  const { currentUser, userProfile } = useAuth();
  const [posts, setPosts] = useState<GalleryPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({
      title: '',
      description: '',
      imageFile: null as File | null,
    });  const [uploading, setUploading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const { userEconomy } = useEconomy();

  useEffect(() => {
    console.log('Uploading state changed:', uploading);
  }, [uploading]);

  const sortedPosts = useMemo(() => {
    const postsToSort = [...posts];
    
    switch (sortBy) {
      case 'recent':
        return postsToSort.sort((a, b) => b.timestamp - a.timestamp);
      
      case 'oldest':
        return postsToSort.sort((a, b) => a.timestamp - b.timestamp);
      
      case 'likes':
        return postsToSort.sort((a, b) => {
          const aLikes = Object.keys(a.likes || {}).length;
          const bLikes = Object.keys(b.likes || {}).length;
          return bLikes - aLikes;
        });
      
      case 'comments':
        return postsToSort.sort((a, b) => {
          const aComments = Object.keys(a.comments || {}).length;
          const bComments = Object.keys(b.comments || {}).length;
          return bComments - aComments;
        });
      
      default:
        return postsToSort;
    }
  }, [posts, sortBy]);

  const getSortButtonClass = (option: SortOption) => {
    return `px-3 py-1 rounded text-sm font-medium transition-colors ${
      sortBy === option
        ? 'bg-blue-600 text-white'
        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
    }`;
  };

  useEffect(() => {
    const postsRef = ref(db, 'gallery');
    const unsubscribe = onValue(postsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const postsArray = Object.entries(data).map(([id, post]: [string, any]) => ({
          id,
          ...post,
          likes: post.likes || {},
          comments: post.comments || {},
        }));
        postsArray.sort((a, b) => b.timestamp - a.timestamp);
        setPosts(postsArray);
      } else {
        setPosts([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setUploadData(prev => ({ ...prev, imageFile: file }));
    }
  };
  const uploadPost = async () => {
    if (!currentUser || !userProfile || !uploadData.imageFile || !uploadData.title.trim()) return;
    
    if (uploading) {
      console.log('Upload already in progress, ignoring request');
      return;
    }
    
    setUploading(true);
    console.log('Starting upload process...');
    
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          console.log('File read complete, uploading to database...');
          const imageUrl = e.target?.result as string;
          
          const postData = {
            userId: currentUser.uid,
            username: userProfile.displayName || 'Anonymous',
            imageUrl,
            title: uploadData.title.trim(),
            description: uploadData.description.trim(),
            timestamp: Date.now(),
            likes: {},
            comments: {},
          };

          await push(ref(db, 'gallery'), postData);
          console.log('Post uploaded successfully');
          
          try {
            await economyService.awardPostCreation(currentUser.uid);
            console.log('Post creation bonus awarded successfully');
          } catch (economyError) {
            console.error('Failed to award post creation bonus:', economyError);
          }
          
          setUploadData({ title: '', description: '', imageFile: null });
          setShowUploadModal(false);
          
        } catch (uploadError) {
          console.error('Error during upload:', uploadError);
          alert('Failed to upload post. Please try again.');
        } finally {
          setUploading(false);
          console.log('Upload process completed');
        }
      };
      
      reader.onerror = () => {
        console.error('Error reading file');
        alert('Error reading file. Please try again.');
        setUploading(false);
      };
      
      reader.readAsDataURL(uploadData.imageFile);
      
    } catch (error) {
      console.error('Error starting upload:', error);
      alert('Failed to start upload. Please try again.');
      setUploading(false);
    }
  };

  const toggleLike = async (postId: string) => {
    if (!currentUser) return;
    
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    
    const isLiked = post.likes[currentUser.uid];
    const likesRef = ref(db, `gallery/${postId}/likes/${currentUser.uid}`);
    
    if (isLiked) {
      await remove(likesRef);

      if (post.userId !== currentUser.uid) {
          console.log('Removing like reward from post owner:', post.userId);
          try {
            await economyService.removeLike(
              post.userId,
              currentUser.uid,
              userProfile?.displayName || userProfile?.email || 'Anonymous',
              postId
            );
            console.log('Like reward removed successfully');
          } catch (economyError) {
            console.error('Failed to remove like reward:', economyError);
          }
        }
    } else {
      await update(ref(db, `gallery/${postId}/likes`), {
        [currentUser.uid]: true
      });

      if (post.userId !== currentUser.uid) {
        await economyService.awardLike(
          post.userId,
          currentUser.uid,
          userProfile?.displayName || userProfile?.email || 'Anonymous',
          postId
        );
      }
    }
  };

  const addComment = async (postId: string, commentText: string) => {
    if (!currentUser || !userProfile || !commentText.trim()) return;
    
    const commentData = {
      userId: currentUser.uid,
      username: userProfile.displayName || 'Anonymous',
      text: commentText.trim(),
      timestamp: Date.now(),
    };
    
    try {
      await push(ref(db, `gallery/${postId}/comments`), commentData);
      const post = posts.find(p => p.id === postId);
      if (post && post.userId !== currentUser.uid) {
        console.log('Checking if user has already commented on this post...');
        const hasAlreadyCommented = await economyService.hasUserCommentedOnPost(
          post.userId,
          currentUser.uid,
          postId
        );
        if (!hasAlreadyCommented) {
          console.log('First comment from this user, awarding reward to post owner:', post.userId);
          try {
            await economyService.awardComment(
              post.userId,
              currentUser.uid,
              userProfile.displayName || userProfile.email || 'Anonymous',
              postId
            );
            console.log('Comment reward awarded successfully');
          } catch (economyError) {
            console.error('Failed to award comment reward:', economyError);
          }
        } else {
          console.log('User has already been rewarded for commenting on this post, skipping reward');
        }
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };
  const deletePost = async (postId: string) => {
    if (!currentUser) return;
    
    const post = posts.find(p => p.id === postId);
    if (!post || post.userId !== currentUser.uid) {
        alert('You can only delete your own posts');
        return;
    }
    
    if (confirm('Are you sure you want to delete this post? This will also remove all associated coin rewards.')) {
        try {
            try {
                if (post.likes) {
                    const likePromises = Object.keys(post.likes).map(async (likerId) => {
                        if (likerId !== currentUser.uid) {
                            try {
                                console.log(`Removing like reward from post owner ${post.userId} for like by ${likerId}`);
                                await economyService.removeLike(
                                    post.userId,
                                    likerId,
                                    'User',
                                    postId
                                );
                            } catch (error) {
                                console.error(`Error removing like reward for ${likerId}:`, error);
                            }
                        }
                    });
                    await Promise.all(likePromises);
                    console.log(`Removed like rewards for ${Object.keys(post.likes).length} likes`);
                }
                
                if (post.comments) {
                    const uniqueCommenters = new Set();
                    Object.values(post.comments).forEach((comment: any) => {
                        if (comment.userId !== currentUser.uid) { 
                            uniqueCommenters.add(comment.userId);
                        }
                    });
                    
                    const commentPromises = Array.from(uniqueCommenters).map(async (commenterId: any) => {
                        try {
                            console.log(`Removing comment reward from post owner ${post.userId} for comments by ${commenterId}`);
                            await economyService.removeComment(
                                post.userId,
                                commenterId,
                                'User',
                                postId
                            );
                        } catch (error) {
                            console.error(`Error removing comment reward for ${commenterId}:`, error);
                        }
                    });
                    await Promise.all(commentPromises);
                    console.log(`Removed comment rewards for ${uniqueCommenters.size} unique commenters`);
                }
            } catch (rewardError) {
                console.error('Error removing like/comment rewards:', rewardError);
            }
            await remove(ref(db, `gallery/${postId}`));
            
            try {
                await economyService.removePostCreation(currentUser.uid);
                console.log('Post creation bonus removed successfully');
            } catch (economyError) {
                console.error('Failed to remove post creation bonus:', economyError);
            }
            
        } catch (error) {
            console.error('Error deleting post:', error);
            alert('Failed to delete post. Please try again.');
        }
    }
  };

  const deleteComment = async (postId: string, commentId: string, commentUserId: string) => {
    if (!currentUser) return;
    
    if (commentUserId !== currentUser.uid) {
      alert('You can only delete your own comments');
      return;
    }
    
    if (confirm('Are you sure you want to delete this comment?')) {
      try {
        const commentRef = ref(db, `gallery/${postId}/comments/${commentId}`);
        const commentSnapshot = await get(commentRef);
        
        if (commentSnapshot.exists()) {
          const commentData = commentSnapshot.val();
          await remove(commentRef);
          const post = posts.find(p => p.id === postId);
          if (post && post.userId !== currentUser.uid) {
            const allCommentsRef = ref(db, `gallery/${postId}/comments`);
            const allCommentsSnapshot = await get(allCommentsRef);
            let hasOtherComments = false;
            if (allCommentsSnapshot.exists()) {
              const allComments = allCommentsSnapshot.val();
              hasOtherComments = Object.values(allComments).some(
                (comment: any) => comment.userId === currentUser.uid
              );
            }
            if (!hasOtherComments) {
              console.log('Removing comment reward from post owner:', post.userId);
              try {
                await economyService.removeComment(
                  post.userId,
                  currentUser.uid,
                  userProfile?.displayName || userProfile?.email || 'Anonymous',
                  postId
                );
                console.log('Comment reward removed successfully');
              } catch (economyError) {
                console.error('Failed to remove comment reward:', economyError);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error deleting comment:', error);
        alert('Failed to delete comment. Please try again.');
      }
    }
  };

  const PostCard: React.FC<{ post: GalleryPost }> = ({ post }) => {
    const [showComments, setShowComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    
    const likesCount = Object.keys(post.likes).length;
    const commentsArray = Object.entries(post.comments).map(([id, comment]: [string, any]) => ({
      id,
      ...comment,
    })).sort((a, b) => a.timestamp - b.timestamp);
    
    const isLiked = currentUser ? post.likes[currentUser.uid] : false;
    const isPostOwner = currentUser?.uid === post.userId;

    const handleComment = (e: React.FormEvent) => {
      e.preventDefault();
      if (newComment.trim()) {
        addComment(post.id, newComment);
        setNewComment('');
      }
    };

    return (
        <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
        <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
            <div>
                <h3 className="text-white font-semibold">{post.title}</h3>
                <p className="text-gray-400 text-sm">by {post.username}</p>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">
                {new Date(post.timestamp).toLocaleDateString()}
                </span>
                {isPostOwner && (
                <button
                    onClick={() => deletePost(post.id)}
                    className="text-red-400 hover:text-red-300 p-1 rounded transition-colors"
                    title="Delete post"
                >
                    🗑️
                </button>
                )}
            </div>
            </div>
            {post.description && (
            <p className="text-gray-300 mt-2 text-sm">{post.description}</p>
            )}
        </div>
        
        <div className="bg-black flex items-center justify-center min-h-64">
            <img 
            src={post.imageUrl} 
            alt={post.title}
            className="max-w-full max-h-96 object-contain"
            />
        </div>
        <div className="p-4">
            <div className="flex items-center justify-between mb-4">
            <button
                onClick={() => toggleLike(post.id)}
                className={`flex items-center gap-2 px-3 py-1 rounded transition-colors ${
                isLiked 
                    ? 'bg-red-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                disabled={!currentUser}
            >
                ❤️ {likesCount}
            </button>
            
            <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center gap-2 px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
            >
                💬 {commentsArray.length}
            </button>
            </div>
            
            {showComments && (
            <div className="space-y-3">
                {commentsArray.map((comment) => {
                const isCommentOwner = currentUser?.uid === comment.userId;
                
                return (
                    <div key={comment.id} className="bg-gray-700 rounded p-3">
                    <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-2">
                        <span className="text-blue-400 font-medium text-sm">{comment.username}</span>
                        <span className="text-gray-500 text-xs">
                            {new Date(comment.timestamp).toLocaleDateString()}
                        </span>
                        </div>
                        {isCommentOwner && (
                        <button
                        onClick={() => deleteComment(post.id, comment.id, comment.userId)}
                            className="text-red-400 hover:text-red-300 text-xs p-1 rounded transition-colors"
                            title="Delete comment"
                        >
                            🗑️
                        </button>
                        )}
                    </div>
                    <p className="text-gray-200 text-sm">{comment.text}</p>
                    </div>
                );
                })}
                
                {currentUser && (
                <form onSubmit={handleComment} className="flex gap-2">
                    <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    />
                    <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                    Post
                    </button>
                </form>
                )}
            </div>
            )}
        </div>
        </div>
    );
    };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-xl">Loading gallery...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">DotVerse Gallery</h1>

          {currentUser && userEconomy && (
              <div className="bg-gradient-to-r from-yellow-600 to-orange-600 px-4 py-2 rounded-lg">
                <div className="text-center">
                  <p className="text-sm opacity-80">Your Balance</p>
                  <p className="text-xl font-bold">{userEconomy.balance?.toLocaleString() || 0} 🪙</p>
                </div>
              </div>
            )}
          {currentUser && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              📸 Share Screenshot
            </button>
          )}
        </div>

        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">💰 Earn Coins by Engaging!</h3>
              <p className="text-sm opacity-90">
                Get +2 🪙 for each like • +5 🪙 for each comment • +10 🪙 for posting
              </p>
            </div>
            <div className="text-right">
              <a href="/economy" className="bg-white bg-opacity-20 hover:bg-opacity-30 px-4 py-2 rounded-lg transition-colors">
                View Dashboard
              </a>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <span className="text-gray-300 font-medium">Sort by:</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSortBy('recent')}
                className={getSortButtonClass('recent')}
              >
                📅 Most Recent
              </button>
              <button
                onClick={() => setSortBy('likes')}
                className={getSortButtonClass('likes')}
              >
                ❤️ Most Likes
              </button>
              <button
                onClick={() => setSortBy('comments')}
                className={getSortButtonClass('comments')}
              >
                💬 Most Comments
              </button>
              <button
                onClick={() => setSortBy('oldest')}
                className={getSortButtonClass('oldest')}
              >
                🕐 Oldest First
              </button>
            </div>
            <div className="text-sm text-gray-400">
              {posts.length} post{posts.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sortedPosts.length > 0 ? (
            sortedPosts.map((post) => <PostCard key={post.id} post={post} />)
          ) : (
            <div className="col-span-full text-center py-12">
              <div className="text-gray-400 text-lg">No posts yet</div>
              <p className="text-gray-500 mt-2">Be the first to share your creation!</p>
            </div>
          )}
        </div>
      </div>      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 relative">
            <h2 className="text-xl font-bold mb-4">Share Your Screenshot</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                  disabled={uploading}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <input
                  type="text"
                  value={uploadData.title}
                  onChange={(e) => setUploadData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Give your creation a title"
                  required
                  disabled={uploading}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Description (optional)</label>
                <textarea
                  value={uploadData.description}
                  onChange={(e) => setUploadData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  placeholder="Tell us about your creation"
                  rows={3}
                  disabled={uploading}
                />
              </div>
            </div>
              <div className="flex gap-3 mt-6">
              <button
                onClick={() => !uploading && setShowUploadModal(false)}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={uploading}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  console.log('Upload button clicked, uploading state:', uploading);
                  if (!uploading) {
                    uploadPost();
                  } else {
                    console.log('Upload in progress, ignoring click');
                  }
                }}
                disabled={uploading || !uploadData.title.trim() || !uploadData.imageFile}
                className={`flex-1 px-4 py-2 rounded transition-colors ${
                  uploading 
                    ? 'bg-gray-600 cursor-wait' 
                    : 'bg-purple-600 hover:bg-purple-700'
                } text-white disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                {uploading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Uploading...
                  </span>
                ) : 'Share'}
              </button>
            </div>
            {uploading && (
              <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-black bg-opacity-95 rounded-lg flex items-center justify-center z-20 backdrop-blur-sm">
                <div className="text-center p-8">
                  <div className="relative mb-6">
                    <div className="animate-spin rounded-full h-20 w-20 border-4 border-purple-500 border-t-transparent mx-auto"></div>
                    <div className="absolute inset-0 rounded-full h-20 w-20 border-4 border-purple-300 border-b-transparent mx-auto animate-pulse"></div>
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">📤 Uploading...</h3>
                  <p className="text-purple-200 text-lg mb-2">Sharing your amazing creation</p>
                  <p className="text-yellow-300 font-semibold">+10 🪙 bonus incoming!</p>
                  <p className="text-sm text-gray-300 mt-4 opacity-75">Please don't close this window</p>
                  
                  {/* Progress dots animation */}
                  <div className="flex justify-center space-x-2 mt-4">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Full-screen upload overlay for extra protection and visual feedback */}
      {uploading && showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-60 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mx-auto mb-4"></div>
            <p className="text-white text-lg font-semibold">Processing Upload...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Gallery;