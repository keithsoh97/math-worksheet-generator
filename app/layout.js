import './globals.css'

export const metadata = {
  title: 'Math Worksheet Generator',
  description: 'AI-powered math practice question generator for O-Level & A-Level',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
