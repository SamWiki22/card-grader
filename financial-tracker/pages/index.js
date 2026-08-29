import Head from "next/head";
import FinancialTracker from "../components/FinancialTracker";

export default function Home() {
  return (
    <>
      <Head>
        <title>Financial Tracker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#1F5C4C" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Financial Tracker" />
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <FinancialTracker />
    </>
  );
}
