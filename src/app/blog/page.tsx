import type { Metadata } from "next";
import Link from "next/link";
import { posts } from "@/content/blog/posts";

export const metadata: Metadata = {
  title: "Blog — Don't Train On Me",
  description:
    "Analysis, guides, and warnings about AI training opt-out, crawler management, and content protection.",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function BlogIndex() {
  // Newest first
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <main>

      <h1>
        <span className="shield">📝</span> Blog
      </h1>
      <p className="tagline">
        Analysis, guides, and warnings about AI training opt-out, crawler
        management, and content protection.
      </p>

      <div className="blog-list">
        {sorted.map((post) => (
          <article key={post.slug} className="blog-card">
            <h2 className="blog-card__title">
              <Link href={`/blog/${post.slug}`}>{post.title}</Link>
            </h2>
            <div className="blog-card__meta">
              <time dateTime={post.date}>{formatDate(post.date)}</time>
              <span className="blog-card__sep">·</span>
              <span>{post.author}</span>
            </div>
            <p className="blog-card__desc">{post.description}</p>
            <div className="blog-card__tags">
              {post.tags.map((tag) => (
                <span key={tag} className="blog-tag">
                  {tag}
                </span>
              ))}
            </div>
            <Link href={`/blog/${post.slug}`} className="blog-card__readmore">
              Read more →
            </Link>
          </article>
        ))}
      </div>

      <footer>
        Open source · nothing stored · no API keys · methodology and research notes in{" "}
        <a
          href="https://github.com/zeecares/4allhuman"
          target="_blank"
          rel="noreferrer noopener"
        >
          github.com/zeecares/4allhuman
        </a>
      </footer>
    </main>
  );
}
