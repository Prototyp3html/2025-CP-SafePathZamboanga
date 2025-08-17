
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { User, Clock, ThumbsUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Reply {
  id: number;
  author: string;
  content: string;
  timestamp: string;
  likes: number;
}

interface PostRepliesModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: {
    id: number;
    title: string;
    author: string;
    content: string;
    timestamp: string;
    replies: number;
    likes: number;
    urgent: boolean;
    category: string;
    tags: string[];
  };
  onReplyAdded: () => void;
}

export const PostRepliesModal = ({ isOpen, onClose, post, onReplyAdded }: PostRepliesModalProps) => {
  const [newReply, setNewReply] = useState('');
  const [replies, setReplies] = useState<Reply[]>([
    {
      id: 1,
      author: 'Carlos Rivera',
      content: 'I can confirm the flooding. I suggest using the bypass road through San Jose Street.',
      timestamp: '1 hour ago',
      likes: 3
    },
    {
      id: 2,
      author: 'Lisa Chen',
      content: 'Thanks for the update! The alternative route worked perfectly for me.',
      timestamp: '45 minutes ago',
      likes: 1
    }
  ]);
  const [likedReplies, setLikedReplies] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newReply.trim()) {
      toast({
        title: "Error",
        description: "Please enter a reply.",
        variant: "destructive",
      });
      return;
    }

    const reply: Reply = {
      id: Date.now(),
      author: 'Current User',
      content: newReply.trim(),
      timestamp: 'Just now',
      likes: 0
    };

    setReplies([...replies, reply]);
    setNewReply('');
    onReplyAdded();

    toast({
      title: "Reply posted!",
      description: "Your reply has been added to the discussion.",
    });
  };

  const handleLikeReply = (replyId: number) => {
    const isAlreadyLiked = likedReplies.has(replyId);

    setReplies(prevReplies => prevReplies.map(reply =>
      reply.id === replyId
        ? { ...reply, likes: isAlreadyLiked ? reply.likes - 1 : reply.likes + 1 }
        : reply
    ));

    setLikedReplies(prev => {
      const newSet = new Set(prev);
      if (isAlreadyLiked) {
        newSet.delete(replyId);
      } else {
        newSet.add(replyId);
      }
      return newSet;
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-left">Discussion</DialogTitle>
        </DialogHeader>

        {/* Original Post */}
        <div className="border-b pb-6 mb-6">
          <div className="flex items-start space-x-3 mb-3">
            <div className="w-10 h-10 bg-wmsu-blue rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-1">
                {post.title}
                {post.urgent && (
                  <Badge variant="destructive" className="ml-2">URGENT</Badge>
                )}
              </h3>
              <div className="flex items-center text-sm text-gray-600 space-x-4 mb-3">
                <span>by {post.author}</span>
                <div className="flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  {post.timestamp}
                </div>
              </div>
              <p className="text-gray-700 mb-3">{post.content}</p>
              <div className="flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Replies */}
        <div className="space-y-4 mb-6">
          <h4 className="font-semibold text-lg">Replies ({replies.length})</h4>
          {replies.map((reply) => (
            <div key={reply.id} className="flex items-start space-x-3 bg-gray-50 p-4 rounded-lg">
              <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center text-sm text-gray-600 space-x-4 mb-2">
                  <span className="font-medium">{reply.author}</span>
                  <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {reply.timestamp}
                  </div>
                </div>
                <p className="text-gray-700 mb-2">{reply.content}</p>
                <button
                  onClick={() => handleLikeReply(reply.id)}
                  className={`flex items-center text-sm transition-colors ${
                    likedReplies.has(reply.id)
                      ? 'text-red-500 hover:text-red-600'
                      : 'text-gray-600 hover:text-wmsu-blue'
                  }`}
                >
                  <ThumbsUp className={`w-3 h-3 mr-1 ${likedReplies.has(reply.id) ? 'fill-current' : ''}`} />
                  <span>{reply.likes}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Reply Form */}
        <form onSubmit={handleSubmitReply} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Add a reply</label>
            <Textarea
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              placeholder="Share your thoughts or provide additional information..."
              rows={3}
              maxLength={500}
            />
            <div className="text-right text-xs text-gray-500 mt-1">
              {newReply.length}/500 characters
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit">
              Post Reply
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};