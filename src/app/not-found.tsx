import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export default function NotFound() {
  return (
    <main className="gate">
      <header className="ident">
        <div className="ident-left">
          <BrandMark />
          <h1 className="wordmark">LIVE BOARD</h1>
        </div>
      </header>
      <div className="gate-main">
        <section className="gate-card">
          <h2>Board not found</h2>
          <p>That company slug does not exist yet. An admin can create it.</p>
          <p>
            <Link href="/">All boards</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
