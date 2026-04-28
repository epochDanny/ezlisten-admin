import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ezlisten Admin',
  description: 'Manage Ezlisten audio files, transcripts, and filter timestamps.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
