import { useState } from "react";
import { useEffect } from "react";
import { NavigationBar } from "../components/NavigationBar";
import { CreatePostModal } from "../components/CreatePostModal";
import { PostRepliesModal } from "../components/PostRepliesModal";
import {
  MessageSquare,
  ThumbsUp,
  Clock,
  User,
  Plus,
  Search,
  TrendingUp,
  Filter,
  Trash2,
} from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { notification } from "../utils/notifications";
import { useConfirmation } from "../components/ui/confirmation-dialog";

// Define interfaces for the forum data
interface ForumPost {
  id: number;
  title: string;
  content: string;
  author_id: number;
  author_name: string;
  author_profile_picture?: string; // Base64 profile picture
  category: string;
  tags: string[];
  likes_count: number;
  replies_count: number;
  is_urgent: boolean;
  created_at: string;
  updated_at: string;
  is_liked: boolean;
  timestamp: string;
}

interface ForumStats {
  total_members: number;
  posts_today: number;
  active_now: number;
  total_posts: number;
}

// Helper function to format report content for better display
const formatReportContent = (content: string) => {
  // Check if this is a report post (contains "ALERT" and structured data)
  if (!content.includes("ALERT") || !content.includes("Location:")) {
    return content; // Return normal content as-is
  }

  // Parse structured report content
  const lines = content.split('\n').filter(line => line.trim());
  const reportData: any = {};
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.includes("Location:")) reportData.location = trimmed.replace("Location:", "").trim();
    if (trimmed.includes("Description:")) reportData.description = trimmed.replace("Description:", "").trim();
    if (trimmed.includes("Severity:")) reportData.severity = trimmed.replace("Severity:", "").trim();
    if (trimmed.includes("Weather Conditions:")) reportData.weather = trimmed.replace("Weather Conditions:", "").trim();
    if (trimmed.includes("Temperature:")) reportData.temperature = trimmed.trim();
    if (trimmed.includes("Wind Speed:")) reportData.windSpeed = trimmed.trim();
    if (trimmed.includes("ALERT")) reportData.type = trimmed.replace("ALERT", "").trim();
  });

  return reportData;
};

const CommunityForum = () => {
  const { confirm } = useConfirmation();

  useEffect(() => {
    document.body.style.overflow = "auto";
  }, []);

  // User authentication state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check for authenticated user
  useEffect(() => {
    const userData = localStorage.getItem("user_data");
    const adminData = localStorage.getItem("admin_data");

    console.log("🔍 User Data Check:", {
      userData: userData ? "Found" : "Not found",
      adminData: adminData ? "Found" : "Not found",
    });

    // Check for admin user first
    if (adminData) {
      const parsedAdmin = JSON.parse(adminData);
      console.log("🔍 Admin Data:", parsedAdmin);
      if (parsedAdmin.userType === "admin" || parsedAdmin.role === "admin") {
        setIsAdmin(true);
        setUser(parsedAdmin);
        console.log("✅ Admin user detected from admin_data");
        return;
      }
    }

    // Check for regular user
    if (userData) {
      const parsedUser = JSON.parse(userData);
      console.log("🔍 User Data:", parsedUser);

      // Check if this user is actually an admin
      if (parsedUser.userType === "admin" || parsedUser.role === "admin") {
        setIsAdmin(true);
        setUser(parsedUser);
        console.log("✅ Admin user detected from user_data");
        return;
      }

      setUser(parsedUser);
    }
  }, []);

  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState("recent");
  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [forumStats, setForumStats] = useState<ForumStats>({
    total_members: 0,
    posts_today: 0,
    active_now: 0,
    total_posts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check authentication status
  useEffect(() => {
    const token =
      localStorage.getItem("access_token") ||
      localStorage.getItem("admin_token") ||
      localStorage.getItem("user_token");
    setIsLoggedIn(!!token);
  }, []);

  // API functions
  const getAuthHeaders = () => {
    // Prioritize admin_token first for admin actions
    const token =
      localStorage.getItem("admin_token") ||
      localStorage.getItem("access_token") ||
      localStorage.getItem("user_token");

    console.log("🔍 Available tokens:", {
      access_token: localStorage.getItem("access_token")
        ? "Found"
        : "Not found",
      admin_token: localStorage.getItem("admin_token") ? "Found" : "Not found",
      user_token: localStorage.getItem("user_token") ? "Found" : "Not found",
      selected_token: token ? `${token.substring(0, 20)}...` : "None",
    });

    return {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  };

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        skip: "0",
        limit: "50",
        sort_by: sortBy,
      });

      if (selectedCategory !== "all") {
        params.append("category", selectedCategory);
      }

      if (searchTerm.trim()) {
        params.append("search", searchTerm.trim());
      }

      const apiBaseUrl =
        import.meta.env.VITE_API_BASE_URL ||
        `${
          import.meta.env.VITE_API_URL ||
          import.meta.env.VITE_BACKEND_URL ||
          "http://localhost:8001"
        }/api`;

      const response = await fetch(`${apiBaseUrl}/forum/posts?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Forum posts fetched:", data.posts?.length || 0);
      console.log(
        "Reports found:",
        data.posts?.filter((p) => p.category === "reports")?.length || 0
      );
      console.log("All categories:", data.posts?.map((p) => p.category) || []);
      setForumPosts(data.posts || []);
      setError(null);
    } catch (err) {
      console.error("Error fetching posts:", err);
      setError("Failed to load posts. Please try again.");
      setForumPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const apiBaseUrl =
        import.meta.env.VITE_API_BASE_URL ||
        `${
          import.meta.env.VITE_API_URL ||
          import.meta.env.VITE_BACKEND_URL ||
          "http://localhost:8001"
        }/api`;

      const response = await fetch(`${apiBaseUrl}/forum/stats`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setForumStats(data);
      }
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  };

  const handleLike = async (postId: number) => {
    if (!isLoggedIn) {
      alert("Please log in to like posts");
      return;
    }

    try {
      const apiUrl =
        import.meta.env.VITE_API_URL ||
        import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:8001";
      const response = await fetch(`${apiUrl}/api/forum/posts/${postId}/like`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();

        // Update the post in the list
        setForumPosts((posts) =>
          posts.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  likes_count: data.likes_count,
                  is_liked: data.liked,
                }
              : post
          )
        );

        // Update liked posts set
        setLikedPosts((prev) => {
          const newSet = new Set(prev);
          if (data.liked) {
            newSet.add(postId);
          } else {
            newSet.delete(postId);
          }
          return newSet;
        });
      } else {
        // Handle error responses
        const errorData = await response.json();
        console.error("Like error:", response.status, errorData);

        if (response.status === 403 || response.status === 401) {
          alert("Please log in to like posts");
        } else {
          alert("Failed to like post. Please try again.");
        }
      }
    } catch (err) {
      console.error("Error toggling like:", err);
      alert("Network error. Please check your connection.");
    }
  };

  const handleDeletePost = async (postId: number, postTitle: string) => {
    if (!isAdmin) {
      notification.auth.unauthorized();
      return;
    }

    console.log("🗑️ DELETE ATTEMPT:", {
      postId,
      postTitle,
      user: user,
      isAdmin: isAdmin,
      headers: getAuthHeaders(),
    });

    try {
      const confirmed = await confirm({
        title: "Delete Post",
        description: `Are you sure you want to delete "${postTitle}"? This action cannot be undone and will also delete all comments and likes associated with this post.`,
        variant: "destructive",
        confirmText: "Delete",
        cancelText: "Cancel",
      });

      if (!confirmed) return;

      const apiUrl =
        import.meta.env.VITE_API_URL ||
        import.meta.env.VITE_BACKEND_URL ||
        "http://localhost:8001";

      const headers = getAuthHeaders();
      console.log("📤 Sending delete request with headers:", headers);
      console.log(
        "📍 Request URL:",
        `${apiUrl}/api/forum/admin/posts/${postId}`
      );

      const response = await fetch(
        `${apiUrl}/api/forum/admin/posts/${postId}`,
        {
          method: "DELETE",
          headers: headers,
        }
      );

      console.log("📥 Delete response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });

      if (response.ok) {
        const data = await response.json();

        // Remove the post from the list
        setForumPosts((posts) => posts.filter((post) => post.id !== postId));

        // Show success notification
        notification.success("Post deleted successfully!");
      } else {
        const errorText = await response.text();
        console.error("❌ Delete failed:", {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });

        if (response.status === 403) {
          notification.auth.unauthorized();
        } else if (response.status === 404) {
          notification.warning(
            "Post not found - it may have already been deleted."
          );
        } else {
          notification.warning("Failed to delete post. Please try again.");
        }
      }
    } catch (err) {
      console.error("Error deleting post:", err);
      notification.error("Network error. Please check your connection.");
    }
  };

  // Load data on component mount and when filters change
  useEffect(() => {
    fetchPosts();
  }, [selectedCategory, searchTerm, sortBy]);

  useEffect(() => {
    fetchStats();
  }, []);

  // Update liked posts set when posts are loaded
  useEffect(() => {
    const likedSet = new Set(
      forumPosts.filter((post) => post.is_liked).map((post) => post.id)
    );
    setLikedPosts(likedSet);
  }, [forumPosts]);

  const categories = [
    { name: "All Posts", count: forumPosts.length },
    {
      name: "Route Alerts",
      count: forumPosts.filter((p) => p.category === "alerts").length,
    },
    {
      name: "Road Reports",
      count: forumPosts.filter((p) => p.category === "reports").length,
    },
    {
      name: "Suggestions",
      count: forumPosts.filter((p) => p.category === "suggestions").length,
    },
    {
      name: "General Discussion",
      count: forumPosts.filter((p) => p.category === "general").length,
    },
  ];

  const stats = [
    { label: "Total Members", value: forumStats.total_members },
    { label: "Posts Today", value: forumStats.posts_today },
    { label: "Active Now", value: forumStats.active_now },
    { label: "Total Posts", value: forumStats.total_posts },
  ];

  // Since we're now filtering on the backend, we can use all posts
  const filteredPosts = forumPosts;

  const handlePostCreated = (newPost: ForumPost) => {
    setForumPosts([newPost, ...forumPosts]);
    // Refresh stats
    fetchStats();
  };

  const handleReplyAdded = (postId: number) => {
    setForumPosts((posts) =>
      posts.map((post) =>
        post.id === postId
          ? { ...post, replies_count: post.replies_count + 1 }
          : post
      )
    );
  };

  return (
    <>
      {/* Check if user is logged in */}
      {user ? (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
          {/* Header Section - Starts from top */}
          <div className="relative bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 overflow-hidden">
            {/* Navbar positioned absolutely on top */}
            <div className="absolute top-0 left-0 right-0 z-50">
              <NavigationBar />
            </div>

            <div className="absolute inset-0 bg-black/10"></div>
            <div className="absolute inset-0">
              <div className="absolute top-10 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-300/20 rounded-full blur-3xl"></div>
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20 text-center">
              <div className="mb-6">
                <div className="inline-flex items-center px-4 py-2 bg-white/20 rounded-full text-white/90 text-sm font-medium mb-4">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  {forumStats.total_members.toLocaleString()} Total Members
                </div>
              </div>

              <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                Community
                <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                  {" "}
                  Forum
                </span>
              </h1>

              <p className="text-xl text-blue-100 mb-10 max-w-3xl mx-auto leading-relaxed">
                Connect with fellow travelers, share real-time road conditions,
                and help keep our community safe through collaborative reporting
              </p>

              <button
                onClick={() => {
                  if (!isLoggedIn) {
                    alert("Please log in to create posts");
                    return;
                  }
                  setIsCreatePostOpen(true);
                }}
                disabled={!isLoggedIn}
                className={`group inline-flex items-center px-8 py-4 font-semibold rounded-2xl shadow-xl transition-all duration-300 ${
                  isLoggedIn
                    ? "bg-white text-blue-600 hover:shadow-2xl transform hover:scale-105"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                }`}
                title={!isLoggedIn ? "Please log in to create posts" : ""}
              >
                <Plus className="w-5 h-5 mr-3 group-hover:rotate-90 transition-transform duration-300" />
                Create New Post
              </button>
            </div>
          </div>

          <div className="max-w-7xl mx-auto px-6 py-10">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Enhanced Left Sidebar */}
              <div className="lg:col-span-1 space-y-6">
                {/* Categories with better styling */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-5">
                    <h3 className="font-bold text-white text-lg">Categories</h3>
                  </div>
                  <div className="p-4 space-y-2">
                    {categories.map((category) => (
                      <button
                        key={category.name}
                        onClick={() =>
                          setSelectedCategory(
                            category.name.toLowerCase().replace(" ", "-")
                          )
                        }
                        className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-200 flex items-center justify-between group ${
                          selectedCategory ===
                          category.name.toLowerCase().replace(" ", "-")
                            ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                            : "hover:bg-gray-50 text-gray-700 hover:text-blue-600"
                        }`}
                      >
                        <span className="font-medium">{category.name}</span>
                        <span
                          className={`text-xs px-3 py-1 rounded-full font-semibold ${
                            selectedCategory ===
                            category.name.toLowerCase().replace(" ", "-")
                              ? "bg-white/20 text-white"
                              : "bg-blue-100 text-blue-600 group-hover:bg-blue-500 group-hover:text-white"
                          }`}
                        >
                          {category.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Enhanced Community Stats */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-green-500 to-teal-600 p-5">
                    <h3 className="font-bold text-white text-lg">
                      Community Stats
                    </h3>
                  </div>
                  <div className="p-4 space-y-4">
                    {stats.map((stat) => (
                      <div
                        key={stat.label}
                        className="flex justify-between items-center p-3 rounded-xl bg-gray-50"
                      >
                        <span className="text-gray-600 font-medium">
                          {stat.label}
                        </span>
                        <span className="font-bold text-2xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                          {stat.value.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Enhanced Main Content */}
              <div className="lg:col-span-3">
                {/* Enhanced Search and Filter Bar */}
                <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 mb-8">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Search discussions, topics, or users..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      />
                    </div>
                    <div className="flex gap-3">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="recent">Most Recent</option>
                        <option value="popular">Most Popular</option>
                        <option value="replied">Most Replied</option>
                      </select>
                      <button className="px-4 py-4 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors duration-200">
                        <Filter className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Enhanced Forum Posts */}
                <div className="space-y-6">
                  {loading ? (
                    <div className="flex justify-center items-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                      <span className="ml-3 text-gray-600">
                        Loading posts...
                      </span>
                    </div>
                  ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                      <p className="text-red-600 mb-4">{error}</p>
                      <Button
                        onClick={fetchPosts}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Try Again
                      </Button>
                    </div>
                  ) : filteredPosts.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        No posts found
                      </h3>
                      <p className="text-gray-500 mb-4">
                        {searchTerm || selectedCategory !== "all"
                          ? "Try adjusting your search or filters"
                          : "Be the first to start a discussion!"}
                      </p>
                      {!searchTerm && selectedCategory === "all" && (
                        <Button
                          onClick={() => setIsCreatePostOpen(true)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Create First Post
                        </Button>
                      )}
                    </div>
                  ) : (
                    filteredPosts.map((post) => (
                      <div
                        key={post.id}
                        className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl border transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] ${
                          post.is_urgent
                            ? "border-l-4 border-l-red-500 bg-gradient-to-r from-red-50 to-white"
                            : "border-gray-100 hover:border-blue-200"
                        }`}
                      >
                        {/* Enhanced Post Header */}
                        <div className="p-6 border-b border-gray-100">
                          <div className="flex items-start space-x-4">
                            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg overflow-hidden">
                              {post.author_profile_picture ? (
                                <img
                                  src={post.author_profile_picture}
                                  alt={`${post.author_name}'s profile`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <User className="w-6 h-6 text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <h3 className="font-bold text-xl text-gray-900 hover:text-blue-600 transition-colors cursor-pointer">
                                  {post.title}
                                </h3>
                                {post.is_urgent && (
                                  <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-full font-bold animate-pulse">
                                    URGENT
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center text-sm text-gray-500 space-x-4">
                                <span className="font-medium text-blue-600">
                                  {post.author_name}
                                </span>
                                <div className="flex items-center">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {post.timestamp}
                                </div>
                                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                                  {post.category}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Enhanced Post Content */}
                        <div className="p-6">
                          {(() => {
                            const formattedContent = formatReportContent(post.content);
                            
                            // If it's a structured report, display it nicely
                            if (typeof formattedContent === 'object' && formattedContent.type) {
                              return (
                                <div className="space-y-4">
                                  {/* Alert Header */}
                                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                                    formattedContent.severity?.includes('HIGH') ? 'bg-red-100 text-red-800' :
                                    formattedContent.severity?.includes('MODERATE') ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-green-100 text-green-800'
                                  }`}>
                                    {formattedContent.type} ALERT
                                  </div>

                                  {/* Report Details */}
                                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                                    {formattedContent.location && (
                                      <div className="flex items-start space-x-3">
                                        <div className="text-sm font-medium text-gray-500 w-20">Location</div>
                                        <div className="text-sm text-gray-900 flex-1">{formattedContent.location}</div>
                                      </div>
                                    )}
                                    
                                    {formattedContent.description && (
                                      <div className="flex items-start space-x-3">
                                        <div className="text-sm font-medium text-gray-500 w-20">Details</div>
                                        <div className="text-sm text-gray-900 flex-1">{formattedContent.description}</div>
                                      </div>
                                    )}
                                    
                                    {formattedContent.severity && (
                                      <div className="flex items-start space-x-3">
                                        <div className="text-sm font-medium text-gray-500 w-20">Severity</div>
                                        <div className={`text-sm font-medium flex-1 ${
                                          formattedContent.severity.includes('HIGH') ? 'text-red-600' :
                                          formattedContent.severity.includes('MODERATE') ? 'text-yellow-600' :
                                          'text-green-600'
                                        }`}>{formattedContent.severity}</div>
                                      </div>
                                    )}
                                    
                                    {(formattedContent.weather || formattedContent.temperature || formattedContent.windSpeed) && (
                                      <div className="flex items-start space-x-3">
                                        <div className="text-sm font-medium text-gray-500 w-20">Weather</div>
                                        <div className="text-sm text-gray-900 flex-1">
                                          {formattedContent.weather && <div>{formattedContent.weather}</div>}
                                          {formattedContent.temperature && <div>{formattedContent.temperature}</div>}
                                          {formattedContent.windSpeed && <div>{formattedContent.windSpeed}</div>}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* Safety Notice */}
                                  <div className="bg-blue-50 border-l-4 border-blue-400 p-3">
                                    <p className="text-sm text-blue-700">
                                      Please exercise caution when traveling through this area and consider alternative routes if possible.
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                            
                            // For regular posts, display content normally
                            return (
                              <p className="text-gray-700 text-lg leading-relaxed mb-4">
                                {post.content}
                              </p>
                            );
                          })()}

                          {/* Enhanced Tags */}
                          <div className="flex flex-wrap gap-2 mb-6">
                            {post.tags.map((tag) => (
                              <span
                                key={tag}
                                className="bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm px-3 py-1 rounded-full cursor-pointer transition-colors duration-200"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>

                          {/* Enhanced Post Actions */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-6">
                              <button
                                onClick={() => setSelectedPostId(post.id)}
                                className="flex items-center text-gray-600 hover:text-blue-600 transition-colors duration-200 group"
                              >
                                <MessageSquare className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-200" />
                                <span className="font-medium">
                                  {post.replies_count} replies
                                </span>
                              </button>
                              <button
                                onClick={() => handleLike(post.id)}
                                disabled={!isLoggedIn}
                                className={`flex items-center transition-all duration-200 group ${
                                  likedPosts.has(post.id)
                                    ? "text-red-500"
                                    : isLoggedIn
                                    ? "text-gray-600 hover:text-red-500"
                                    : "text-gray-400 cursor-not-allowed"
                                }`}
                                title={
                                  !isLoggedIn
                                    ? "Please log in to like posts"
                                    : ""
                                }
                              >
                                <ThumbsUp
                                  className={`w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-200 ${
                                    likedPosts.has(post.id)
                                      ? "fill-current"
                                      : ""
                                  }`}
                                />
                                <span className="font-medium">
                                  {post.likes_count} likes
                                </span>
                              </button>
                            </div>
                            <div className="flex items-center space-x-3">
                              {isAdmin && (
                                <button
                                  onClick={() =>
                                    handleDeletePost(post.id, post.title)
                                  }
                                  className="bg-gradient-to-r from-red-500 to-red-600 text-white px-4 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center space-x-2"
                                  title="Delete this post"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete</span>
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedPostId(post.id)}
                                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                              >
                                Read More
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Load More Button */}
                <div className="text-center mt-8">
                  <button className="bg-white border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-2xl font-medium hover:bg-gray-50 hover:border-blue-300 transition-all duration-200">
                    Load More Posts
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Modals */}
          <CreatePostModal
            isOpen={isCreatePostOpen}
            onClose={() => setIsCreatePostOpen(false)}
            onPostCreated={handlePostCreated}
          />

          {selectedPostId && (
            <PostRepliesModal
              isOpen={selectedPostId !== null}
              onClose={() => setSelectedPostId(null)}
              post={{
                id: forumPosts.find((p) => p.id === selectedPostId)?.id || 0,
                title:
                  forumPosts.find((p) => p.id === selectedPostId)?.title || "",
                author:
                  forumPosts.find((p) => p.id === selectedPostId)
                    ?.author_name || "",
                content:
                  forumPosts.find((p) => p.id === selectedPostId)?.content ||
                  "",
                timestamp:
                  forumPosts.find((p) => p.id === selectedPostId)?.timestamp ||
                  "",
                replies:
                  forumPosts.find((p) => p.id === selectedPostId)
                    ?.replies_count || 0,
                likes:
                  forumPosts.find((p) => p.id === selectedPostId)
                    ?.likes_count || 0,
                urgent:
                  forumPosts.find((p) => p.id === selectedPostId)?.is_urgent ||
                  false,
                category:
                  forumPosts.find((p) => p.id === selectedPostId)?.category ||
                  "",
                tags:
                  forumPosts.find((p) => p.id === selectedPostId)?.tags || [],
              }}
              onReplyAdded={() => handleReplyAdded(selectedPostId)}
            />
          )}
        </div>
      ) : (
        // Show login prompt when no user is logged in
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <NavigationBar />
          <main className="pt-20 container mx-auto px-4 py-8 max-w-4xl">
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 max-w-md mx-auto">
                <MessageSquare className="text-gray-400 dark:text-gray-500 text-6xl mb-4 mx-auto" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">
                  Join the Community
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  You need to be logged in to access the community forum and
                  participate in discussions.
                </p>
                <p className="text-sm text-gray-500">
                  Click the profile icon in the navigation bar to log in and
                  start sharing your experiences with the community.
                </p>
              </div>
            </div>
          </main>
        </div>
      )}
    </>
  );
};

export default CommunityForum;
