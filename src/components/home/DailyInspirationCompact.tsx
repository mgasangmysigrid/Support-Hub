import { useMemo } from "react";
import { Sparkles } from "lucide-react";

const QUOTES = [
  { text: "Success is the sum of small efforts repeated day in and day out.", author: "Robert Collier" },
  { text: "Alone we can do so little; together we can do so much.", author: "Helen Keller" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Coming together is a beginning, staying together is progress, and working together is success.", author: "Henry Ford" },
  { text: "Leadership is not about being in charge. It is about taking care of those in your charge.", author: "Simon Sinek" },
  { text: "The strength of the team is each individual member. The strength of each member is the team.", author: "Phil Jackson" },
  { text: "Talent wins games, but teamwork and intelligence win championships.", author: "Michael Jordan" },
  { text: "Continuous improvement is better than delayed perfection.", author: "Mark Twain" },
  { text: "What we achieve inwardly will change outer reality.", author: "Plutarch" },
  { text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "It is not the strongest of the species that survive, but the one most responsive to change.", author: "Charles Darwin" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "A person who never made a mistake never tried anything new.", author: "Albert Einstein" },
  { text: "Act as if what you do makes a difference. It does.", author: "William James" },
  { text: "Small daily improvements are the key to staggering long-term results.", author: "Robin Sharma" },
  { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
  { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "Great things are done by a series of small things brought together.", author: "Vincent Van Gogh" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { text: "The best way to predict the future is to create it.", author: "Peter Drucker" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "If everyone is moving forward together, then success takes care of itself.", author: "Henry Ford" },
  { text: "Productivity is never an accident. It is always the result of a commitment to excellence.", author: "Paul J. Meyer" },
  { text: "Your work is going to fill a large part of your life, and the only way to be truly satisfied is to do what you believe is great work.", author: "Steve Jobs" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Success usually comes to those who are too busy to be looking for it.", author: "Henry David Thoreau" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
];

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

export default function DailyInspirationCompact() {
  const quote = useMemo(() => QUOTES[dayOfYear() % QUOTES.length], []);

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col h-full justify-center">
      <div className="flex items-center gap-1.5 mb-3">
        <Sparkles className="h-3.5 w-3.5 text-warning" />
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Daily Inspiration
        </h2>
      </div>
      <blockquote className="text-sm italic text-foreground/80 leading-relaxed">
        "{quote.text}"
      </blockquote>
      <p className="text-[10px] text-muted-foreground mt-2">— {quote.author}</p>
    </div>
  );
}
