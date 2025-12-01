import { Header } from '@/components/dashboard/Header';
import { SecFeed } from '@/components/dashboard/SecFeed';
import { EventCalendar } from '@/components/dashboard/EventCalendar';
import { WhaleAlert } from '@/components/dashboard/WhaleAlert';
import { BitcoinChartToggle } from '@/components/charts';
import { OrderBookDepth } from '@/components/charts/OrderBookDepth';
import { SocialSentiment } from '@/components/charts/SocialSentiment';
import { ClaudeAnalysis } from '@/components/charts/ClaudeAnalysis';
import { HistoricalPatterns } from '@/components/charts/HistoricalPatterns';

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-slate-950">
      {/* Background Pattern */}
      <div className="fixed inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDI5M2EiIGZpbGwtb3BhY2l0eT0iMC40Ij48cGF0aCBkPSJNMzYgMzRoLTJ2LTRoMnY0em0wLTZoLTJ2LTRoMnY0em0wLTZoLTJWMThoMnY0em0wLTZoLTJ2LTRoMnY0eiIvPjwvZz48L2c+PC9zdmc+')] opacity-20 pointer-events-none" />

      {/* Gradient Orbs */}
      <div className="fixed top-0 left-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-48 sm:w-96 h-48 sm:h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] sm:w-[800px] h-[400px] sm:h-[800px] bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="relative container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Hero Section - Bitcoin Chart */}
        <section className="mb-6 sm:mb-8">
          <div className="bg-slate-900/30 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-slate-800/50 p-4 sm:p-6 shadow-xl">
            <BitcoinChartToggle />
          </div>
        </section>

        {/* Order Book Depth - Real-time bid/ask visualization */}
        <section className="mb-6 sm:mb-8">
          <OrderBookDepth />
        </section>

        {/* Multi-AI Intelligence Section */}
        <section className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-white">AI Intelligence Hub</h2>
            <span className="px-2 py-0.5 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-amber-500/20 text-slate-400 text-xs rounded-full border border-slate-700">
              3 AI Models
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Grok - X Social Sentiment (real-time pulse) */}
            <SocialSentiment />

            {/* Claude - Deep Market Analysis (scenario modeling) */}
            <ClaudeAnalysis />

            {/* Gemini - Historical Patterns (pattern recognition) */}
            <HistoricalPatterns />
          </div>
        </section>

        {/* Whale Alert - Full Width */}
        <section className="mb-6 sm:mb-8">
          <WhaleAlert />
        </section>

        {/* SEC Feed */}
        <section className="mb-6 sm:mb-8">
          <SecFeed />
        </section>

        {/* Event Calendar - Full Width */}
        <section className="mt-4 sm:mt-6">
          <EventCalendar />
        </section>

        {/* Footer */}
        <footer className="mt-8 sm:mt-12 pb-6 sm:pb-8 text-center">
          <p className="text-xs sm:text-sm text-slate-600">
            Data from Polygon.io, Kraken, Finnhub, and SEC.gov.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            AI powered by <span className="text-amber-400/70">Gemini</span> • <span className="text-cyan-400/70">Grok</span> • <span className="text-purple-400/70">Claude</span>
          </p>
          <p className="text-xs text-slate-700 mt-2">
            TradePulse © {new Date().getFullYear()} — Market Anomaly Dashboard
          </p>
        </footer>
      </main>
    </div>
  );
}
