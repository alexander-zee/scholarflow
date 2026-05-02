import AuthChrome from "./AuthChrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthChrome>{children}</AuthChrome>;
}
