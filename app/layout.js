// Server component (default). We'll mount the client globe via dynamic import in page.js
export const metadata = {
  title: "Interactive Dot Globe",
  description: "Three.js point-cloud globe with color controls and hover scatter"
};

import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
