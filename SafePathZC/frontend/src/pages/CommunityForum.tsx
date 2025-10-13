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

const CommunityForum = () => {
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

    // Check for admin user first
    if (adminData) {
      const parsedAdmin = JSON.parse(adminData);
      if (parsedAdmin.userType === "admin" || parsedAdmin.role === "admin") {
        setIsAdmin(true);
        setUser(parsedAdmin);
        return;
      }
    }

    // Check for regular user
    if (userData) {
      const parsedUser = JSON.parse(userData);

      // Check if this user is actually an admin
      if (parsedUser.userType === "admin" || parsedUser.role === "admin") {
        setIsAdmin(true);
        setUser(parsedUser);
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

  // ...existing state and data...
  const [forumPosts, setForumPosts] = useState([
    {
      id: 1,
      title: "Flooding on Veterans Avenue - Alternative Routes?",
      author: "Maria Santos",
      category: "alerts",
      timestamp: "2 hours ago",
      replies: 8,
      likes: 15,
      content:
        "Heavy flooding observed on Veterans Avenue near the market. Looking for safe alternative routes to downtown area.",
      tags: ["flooding", "veterans-avenue", "downtown"],
      urgent: true,
    },
    {
      id: 2,
      title: "Road Construction Update - Canelar Road",
      author: "Juan Dela Cruz",
      category: "reports",
      timestamp: "4 hours ago",
      replies: 3,
      likes: 7,
      content:
        "Construction work has started on Canelar Road. Expected completion in 2 weeks. Traffic diverted to side streets.",
      tags: ["construction", "canelar-road", "traffic"],
      urgent: false,
    },
    {
      id: 3,
      title: "Suggestion: Add Weather Radar Feature",
      author: "Anna Reyes",
      category: "suggestions",
      timestamp: "1 day ago",
      replies: 12,
      likes: 23,
      content:
        "Would be great to have a weather radar overlay on the map to better predict rainfall patterns.",
      tags: ["feature-request", "weather", "radar"],
      urgent: false,
    },
    {
      id: 4,
      title: "Thank you for the safe route alerts!",
      author: "Pedro Martinez",
      category: "general",
      timestamp: "2 days ago",
      replies: 5,
      likes: 18,
      content:
        "This app has been incredibly helpful during the rainy season. The flood alerts saved me from getting stuck yesterday.",
      tags: ["appreciation", "feedback"],
      urgent: false,
    },
    {
      id: 5,
      title: "Landslide Warning - Tumaga Road",
      author: "Local Authority",
      category: "alerts",
      timestamp: "3 days ago",
      replies: 15,
      likes: 32,
      content:
        "URGENT: Landslide risk on Tumaga Road due to continuous rainfall. Avoid this route until further notice.",
      tags: ["landslide", "tumaga-road", "urgent"],
      urgent: true,
    },
  ]);

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
    { label: "Total Members", value: 1247 },
    { label: "Posts Today", value: 8 },
    { label: "Active Now", value: 23 },
    { label: "Total Posts", value: 567 },
  ];

  const filteredPosts = forumPosts.filter((post) => {
    const matchesCategory =
      selectedCategory === "all" ||
      (selectedCategory === "route-alerts" && post.category === "alerts") ||
      (selectedCategory === "road-reports" && post.category === "reports") ||
      (selectedCategory === "suggestions" && post.category === "suggestions") ||
      (selectedCategory === "general-discussion" &&
        post.category === "general");

    const matchesSearch =
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.tags.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase())
      );

    return matchesCategory && matchesSearch;
  });

  const handlePostCreated = (newPost: any) => {
    setForumPosts([newPost, ...forumPosts]);
  };

  const handleLike = (postId: number) => {
    const isAlreadyLiked = likedPosts.has(postId);

    setForumPosts((posts) =>
      posts.map((post) =>
        post.id === postId
          ? { ...post, likes: isAlreadyLiked ? post.likes - 1 : post.likes + 1 }
          : post
      )
    );

    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (isAlreadyLiked) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const handleReplyAdded = (postId: number) => {
    setForumPosts((posts) =>
      posts.map((post) =>
        post.id === postId ? { ...post, replies: post.replies + 1 } : post
      )
    );
  };

  return (
    <>
      {/* Check if user is logged in */}
      {user ? (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
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
                  1,247 Active Members
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
                onClick={() => setIsCreatePostOpen(true)}
                className="group inline-flex items-center px-8 py-4 bg-white text-blue-600 font-semibold rounded-2xl shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
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
                  {filteredPosts.map((post) => (
                    <div
                      key={post.id}
                      className={`bg-white rounded-2xl shadow-xl border transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] ${
                        post.urgent
                          ? "border-l-4 border-l-red-500 bg-gradient-to-r from-red-50 to-white"
                          : "border-gray-100 hover:border-blue-200"
                      }`}
                    >
                      {/* Enhanced Post Header */}
                      <div className="p-6 border-b border-gray-100">
                        <div className="flex items-start space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                            <User className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="font-bold text-xl text-gray-900 hover:text-blue-600 transition-colors cursor-pointer">
                                {post.title}
                              </h3>
                              {post.urgent && (
                                <span className="bg-red-500 text-white text-xs px-3 py-1 rounded-full font-bold animate-pulse">
                                  URGENT
                                </span>
                              )}
                            </div>
                            <div className="flex items-center text-sm text-gray-500 space-x-4">
                              <span className="font-medium text-blue-600">
                                {post.author}
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
                        <p className="text-gray-700 text-lg leading-relaxed mb-4">
                          {post.content}
                        </p>

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
                                {post.replies} replies
                              </span>
                            </button>
                            <button
                              onClick={() => handleLike(post.id)}
                              className={`flex items-center transition-all duration-200 group ${
                                likedPosts.has(post.id)
                                  ? "text-red-500"
                                  : "text-gray-600 hover:text-red-500"
                              }`}
                            >
                              <ThumbsUp
                                className={`w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-200 ${
                                  likedPosts.has(post.id) ? "fill-current" : ""
                                }`}
                              />
                              <span className="font-medium">
                                {post.likes} likes
                              </span>
                            </button>
                          </div>
                          <button className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transform hover:scale-105 transition-all duration-200">
                            Read More
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
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
              post={forumPosts.find((p) => p.id === selectedPostId)!}
              onReplyAdded={() => handleReplyAdded(selectedPostId)}
            />
          )}
        </div>
      ) : (
        // Show login prompt when no user is logged in
        <div className="min-h-screen bg-gray-50">
          <NavigationBar />
          <main className="pt-20 container mx-auto px-4 py-8 max-w-4xl">
            <div className="text-center">
              <div className="bg-white rounded-lg shadow-md p-8 max-w-md mx-auto">
                <MessageSquare className="text-gray-400 text-6xl mb-4 mx-auto" />
                <h2 className="text-2xl font-bold text-gray-800 mb-4">
                  Join the Community
                </h2>
                <p className="text-gray-600 mb-6">
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
