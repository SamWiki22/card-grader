import Head from "next/head";
import CardGrader from "../components/CardGrader";

export default function Home() {
  return (
    <>
      <Head>
        <title>Card Grader</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#FFD700" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Card Grader" />
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <CardGrader />
    </>
  );
}
