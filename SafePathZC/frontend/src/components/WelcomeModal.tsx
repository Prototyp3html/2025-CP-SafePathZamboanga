import { useState, useEffect, useRef } from "react";

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WelcomeModal = ({ isOpen, onClose }: WelcomeModalProps) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);

  const steps = [
    {
      title: "Welcome to SafePath Zamboanga",
      subtitle: "Your Intelligent Route Navigation System",
      description:
        "SafePath helps you find the safest, most efficient routes through Zamboanga City by considering real-time flooding, road conditions, and traffic information.",
      icon: "🗺️",
      highlights: [
        "Real-time flood detection",
        "Multiple transportation modes",
        "Community-driven reports",
        "Route history tracking",
      ],
    },
    {
      title: "Report Issues",
      description: "Help the community by reporting road problems, flooding, and other hazards you encounter.",
      icon: "🚨",
      steps: [
        "Click the 'Report an Issue' button on the right",
        "Select the type of issue (flooding, road blockage, damage, etc.)",
        "Pin your location on the map",
        "Describe the issue and set severity level",
        "Submit to help other travelers",
      ],
    },
    {
      title: "Key Features",
      description: "Explore what makes SafePath unique:",
      icon: "✨",
      features: [
        {
          name: "Terrain Analysis",
          desc: "Considers elevation and terrain difficulty",
        },
        {
          name: "Weather Integration",
          desc: "Real-time weather monitoring",
        },
        {
          name: "GPS Tracking",
          desc: "Track your route and auto-complete when you arrive",
        },
        {
          name: "Route History",
          desc: "Save and review all your completed routes",
        },
        {
          name: "Community Reports",
          desc: "See hazards reported by other users",
        },
        {
          name: "Emergency Support",
          desc: "Quick access to emergency services",
        },
      ],
    },
    {
      title: "Get Started",
      description: "You're all set! Start planning your safe routes now.",
      icon: "🎯",
      tips: [
        "👉 Use the search bars at the top to start",
        "📍 Click on the map to select locations",
        "🚗 Switch transportation modes as needed",
        "💾 Your routes are automatically saved",
      ],
    },
  ];

  const handleDontShowAgain = (checked: boolean) => {
    setDontShowAgain(checked);
    if (checked) {
      localStorage.setItem("safePathWelcomeSkipped", "true");
    }
  };

  // Handle click outside modal to close
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && e.target === modalRef.current) {
        handleClose();
      }
    };

    // Add event listener to the backdrop
    const backdrop = modalRef.current?.parentElement;
    if (backdrop) {
      backdrop.addEventListener("click", handleClickOutside);
      return () => {
        backdrop.removeEventListener("click", handleClickOutside);
      };
    }
  }, [isOpen, dontShowAgain]);

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem("safePathWelcomeSkipped", "true");
    }
    onClose();
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fade-in backdrop-blur-sm p-4"
      ref={modalRef}
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-scale-in border border-blue-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-wmsu-blue via-blue-600 to-blue-700 text-white p-6 sm:p-8 rounded-t-2xl relative">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white hover:bg-white hover:bg-opacity-20 transition-colors duration-200 p-2 rounded-full"
          >
            <i className="fas fa-times text-lg"></i>
          </button>

          <div className="flex items-start gap-4">
            <div className="text-4xl sm:text-5xl">{step.icon}</div>
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">{step.title}</h2>
              {step.subtitle && (
                <p className="text-blue-100 text-sm sm:text-base">{step.subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          {/* Description */}
          {step.description && (
            <p className="text-gray-700 mb-6 leading-relaxed text-sm sm:text-base">
              {step.description}
            </p>
          )}

          {/* Highlights (Step 0) */}
          {step.highlights && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {step.highlights.map((highlight, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200"
                >
                  <i className="fas fa-check-circle text-wmsu-blue flex-shrink-0"></i>
                  <span className="text-sm sm:text-base text-gray-700">{highlight}</span>
                </div>
              ))}
            </div>
          )}

          {/* Steps */}
          {step.steps && (
            <div className="space-y-3 mb-6">
              {step.steps.map((s, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-wmsu-blue text-white rounded-full flex items-center justify-center font-bold text-sm">
                    {idx + 1}
                  </div>
                  <p className="flex-1 text-gray-700 pt-1 text-sm sm:text-base">{s}</p>
                </div>
              ))}
            </div>
          )}

          {/* Features Grid */}
          {step.features && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {step.features.map((feature, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200 hover:shadow-md transition-shadow"
                >
                  <h4 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">
                    {feature.name}
                  </h4>
                  <p className="text-gray-600 text-xs sm:text-sm">{feature.desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* Tips */}
          {step.tips && (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-400 p-4 rounded mb-6">
              <div className="space-y-2">
                {step.tips.map((tip, idx) => (
                  <p key={idx} className="text-gray-700 text-sm sm:text-base">
                    {tip}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t border-gray-200 p-6 sm:p-8 rounded-b-2xl space-y-4">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              {steps.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${
                    idx === currentStep ? "bg-wmsu-blue w-8" : "bg-gray-300"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs sm:text-sm text-gray-600 font-medium">
              {currentStep + 1} of {steps.length}
            </span>
          </div>

          {/* Checkbox */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleDontShowAgain(e.target.checked)}
              className="w-4 h-4 text-wmsu-blue rounded cursor-pointer"
            />
            <span className="text-sm text-gray-700 group-hover:text-gray-900">
              Don't show this again
            </span>
          </label>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            {currentStep > 0 && (
              <button
                onClick={handlePrevious}
                className="flex-1 px-4 py-2 sm:py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-medium text-sm sm:text-base"
              >
                <i className="fas fa-arrow-left mr-2"></i>
                Previous
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-2 sm:py-3 bg-wmsu-blue text-white rounded-lg hover:bg-wmsu-blue-light transition-colors duration-200 font-medium text-sm sm:text-base"
            >
              {isLastStep ? (
                <>
                  <i className="fas fa-check mr-2"></i>
                  Get Started
                </>
              ) : (
                <>
                  Next
                  <i className="fas fa-arrow-right ml-2"></i>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
