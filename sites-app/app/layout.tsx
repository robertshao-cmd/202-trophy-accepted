import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KAHOOT × DETECTIVE × INVOICE｜誰是犯人？",
  description: "破解髒污發票、審問三人一組的口供，再從四條消費行動線找出犯人。",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "發票不會說謊｜誰是犯人？",
    description: "9 題三幕的辦公室發票推理遊戲。",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
