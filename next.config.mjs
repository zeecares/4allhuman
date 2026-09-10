/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dogfooding the audit's own suggestions: HTTP-layer AI opt-outs on every
  // response - X-Robots-Tag noai/noimageai, plus the W3C TDMRep reservation
  // (machine-readable EU DSM Art. 4(3)) with its policy URL.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noai, noimageai" },
          { key: "tdm-reservation", value: "1" },
          { key: "tdm-policy", value: "https://4allhuman.vercel.app/tdm-policy.txt" },
        ],
      },
    ];
  },
};

export default nextConfig;
