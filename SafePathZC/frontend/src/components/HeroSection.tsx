
export const HeroSection = () => {
  return (
    <section
      className="relative bg-gradient-to-r from-wmsu-blue to-wmsu-blue-light py-16 overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 48, 135, 0.8), rgba(74, 144, 226, 0.8)), url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600"><path d="M0,300 C200,100 400,500 600,300 C800,100 1000,400 1000,300 L1000,600 L0,600 Z" fill="rgba(255,255,255,0.1)"/></svg>')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="container mx-auto px-4 text-center relative z-10">
        <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4">
          Stay Safe on Your Journey!
        </h1>
        <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
          Plan your route with real-time weather updates and flood risk alerts for Zamboanga City
        </p>

        {/* Weather Icons Animation */}
        <div className="flex justify-center space-x-8 mb-8 opacity-60">
          <div className="animate-bounce" style={{ animationDelay: '0s' }}>
            <i className="fas fa-cloud-rain text-white text-3xl"></i>
          </div>
          <div className="animate-bounce" style={{ animationDelay: '0.2s' }}>
            <i className="fas fa-route text-white text-3xl"></i>
          </div>
          <div className="animate-bounce" style={{ animationDelay: '0.4s' }}>
            <i className="fas fa-shield-alt text-white text-3xl"></i>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-10 w-20 h-20 bg-white opacity-10 rounded-full animate-pulse"></div>
        <div className="absolute top-32 right-20 w-16 h-16 bg-white opacity-10 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 left-1/4 w-12 h-12 bg-white opacity-10 rounded-full animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>
    </section>
  );
};
