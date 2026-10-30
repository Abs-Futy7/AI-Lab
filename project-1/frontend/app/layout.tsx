import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Laboratory Projects",
  description: "Interactive AI search and constraint-satisfaction laboratory projects",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${raleway.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
