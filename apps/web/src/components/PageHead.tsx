import Head from "next/head";

export const PageHead = ({ title }: { title: string }) => {
  return (
    <Head>
      <title>{title}</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <link rel="manifest" href="/manifest.json" />
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="apple-touch-icon" href="/icon-512.png" />
    </Head>
  );
};
