import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { User, Clock, ThumbsUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Comment {
  id: number;
  post_id: number;
  author_id: number;
  author_name: string;
  author_profile_picture?: string; // Base64 profile picture
  content: string;
  created_at: string;
  updated_at: string;
  timestamp: string;
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

export const PostRepliesModal = ({
  isOpen,
  onClose,
  post,
  onReplyAdded,
}: PostRepliesModalProps) => {
  const [newReply, setNewReply] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Fetch comments when modal opens
  useEffect(() => {
    if (isOpen && post?.id) {
      fetchComments();
    }
  }, [isOpen, post?.id]);

  const getAuthHeaders = () => {
    const token =
      localStorage.getItem("access_token") ||
      localStorage.getItem("admin_token") ||
      localStorage.getItem("user_token");
    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  };

  const fetchComments = async () => {
    if (!post?.id) return;

    try {
      setLoading(true);
      const apiUrl =
        import.meta.env.VITE_API_URL ||
        import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:8001";
      const response = await fetch(
        `${apiUrl}/api/forum/posts/${post.id}/comments`,
        {
          headers: getAuthHeaders(),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setComments(data);
      } else {
        console.error("Failed to fetch comments");
        toast({
          title: "Error",
          description: "Failed to load comments. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
      toast({
        title: "Error",
        description: "Failed to load comments. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newReply.trim()) {
      toast({
        title: "Error",
        description: "Please enter a reply.",
        variant: "destructive",
      });
      return;
    }

    if (!post?.id) return;

    try {
      setSubmitting(true);
      const apiUrl =
        import.meta.env.VITE_API_URL ||
        import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:8001";
      const response = await fetch(
        `${apiUrl}/api/forum/posts/${post.id}/comments`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            content: newReply.trim(),
          }),
        }
      );

      if (response.ok) {
        const newComment = await response.json();
        setComments([...comments, newComment]);
        setNewReply("");
        onReplyAdded();

        toast({
          title: "Reply posted!",
          description: "Your reply has been added to the discussion.",
        });
      } else {
        throw new Error("Failed to post reply");
      }
    } catch (error) {
      console.error("Error posting reply:", error);
      toast({
        title: "Error",
        description: "Failed to post reply. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!post) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Discussion</span>
            {post.urgent && (
              <Badge variant="destructive" className="animate-pulse">
                URGENT
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-full max-h-[70vh]">
          {/* Original Post */}
          <div className="border-b pb-4 mb-4">
            <h3 className="font-bold text-lg mb-2">{post.title}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <User className="w-4 h-4" />
              <span>{post.author}</span>
              <Clock className="w-4 h-4 ml-2" />
              <span>{post.timestamp}</span>
              <Badge variant="outline" className="ml-2">
                {post.category}
              </Badge>
            </div>
            <p className="text-gray-700 mb-3">{post.content}</p>
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {post.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div className="flex-1 overflow-y-auto mb-4">
            <h4 className="font-semibold mb-3">
              {comments.length} {comments.length === 1 ? "Reply" : "Replies"}
            </h4>

            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3 text-gray-600">Loading comments...</span>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No replies yet. Be the first to respond!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    <div className="flex items-start gap-3 mb-2">
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0">
                        {comment.author_profile_picture ? (
                          <img
                            src={comment.author_profile_picture}
                            alt={`${comment.author_name}'s profile`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-blue-600">
                            {comment.author_name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {comment.timestamp}
                          </span>
                        </div>
                        <p className="text-gray-700">{comment.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reply Form */}
          <form onSubmit={handleSubmitReply} className="border-t pt-4">
            <Textarea
              placeholder="Write your reply..."
              value={newReply}
              onChange={(e) => setNewReply(e.target.value)}
              className="min-h-[100px] mb-3"
              disabled={submitting}
            />
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {newReply.length}/500 characters
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    !newReply.trim() || newReply.length > 500 || submitting
                  }
                >
                  {submitting ? "Posting..." : "Post Reply"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};
