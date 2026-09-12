import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getPostBySlug,
  getAllSlugs,
  type BlogBlock,
} from "@/content/blog/posts";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Pre-render every post at build time. */
export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

/** Per-post metadata for <head>. */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post not found" };

  return {
    title: `${post.title} — Don't Train On Me`,
    description: post.description,
    authors: [{ name: post.author }],
    keywords: post.tags,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Render a single content block as JSX. */
function Block({ block }: { block: BlogBlock }) {
  switch (block.type) {
    case "p":
      return <p className="post__p">{block.text}</p>;
    case "h2":
      return <h2 className="post__h2">{block.text}</h2>;
    case "h3":
      return <h3 className="post__h3">{block.text}</h3>;
    case "ul":
      return (
        <ul className="post__ul">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="post__ol">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case "code":
      return (
        <pre className="post__code">
          <code>{block.code}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote className="post__quote">{block.text}</blockquote>
      );
    default:
      return null;
  }
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) notFound();

  return (
    <main>

      <article className="post">
        <h1 className="post__title">{post.title}</h1>
        <div className="post__meta">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          <span className="post__sep">·</span>
          <span>{post.author}</span>
        </div>
        <div className="post__tags">
          {post.tags.map((tag) => (
            <span key={tag} className="blog-tag">
              {tag}
            </span>
          ))}
        </div>

        <div className="post__body">
          {post.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>

        <div className="post__cta">
          <Link href="/" className="post__cta-link">
            → Scan your site at 4allhuman.vercel.app
          </Link>
        </div>
      </article>

      <footer>
        Open source · nothing stored · no API keys · methodology and research
        notes in{" "}
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
