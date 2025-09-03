import { NavigationBar } from "../components/NavigationBar";
import RiskRouteMap from "../components/RiskRouteMap";

const RiskAnalysis = () => {
  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <NavigationBar />

      <main className="pt-16">
        <div className="h-[calc(100vh-4rem)]">
          <RiskRouteMap />
        </div>
      </main>
    </div>
  );
};

export default RiskAnalysis;
