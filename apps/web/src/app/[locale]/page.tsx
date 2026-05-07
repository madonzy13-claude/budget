import { redirect } from "next/navigation";

interface RootPageProps {
  params: Promise<{ locale: string }>;
}

export default async function RootPage({ params }: RootPageProps) {
  const { locale } = await params;
  redirect(`/${locale}/sign-in`);
}
