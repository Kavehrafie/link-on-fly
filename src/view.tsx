import { type Child } from "hono/jsx";
import { html } from "hono/html";
import { formatDisplayDate } from "./lib";

type Page410Props = {
  expireAt: string;
  locale: string;
}

export const Page410 = ({ expireAt, locale }: Page410Props) => (
  <Layout title="Link Expired" locale={locale}>
    <h1>410 Gone</h1>
    <p>This link has expired and is no longer available.</p>
    <p>Expired on {formatDisplayDate(expireAt, locale)}</p>
  </Layout>
)

type Page404Props = {
  locale: string;
}
export const Page404 = ({ locale }: Page404Props) => (
  <Layout title="Page Not Found" locale={locale}>
    <h1>404 Not Found</h1>
    <p>The requested resource could not be found.</p>
  </Layout>
)

type Page425Props = {
  publishAt: string;
  locale: string;
}
export const Page425 = ({ locale, publishAt }: Page425Props) => (
  <Layout title="Too Early" locale={locale}>
    <h1>425 Too Early</h1>
    <p>This link isn't published yet. It will be available after {formatDisplayDate(publishAt, locale)}.</p>
  </Layout>
)

type LayoutProps = {
  locale: string;
  title: string;
  children: Child;
}
export const Layout = ({ locale, title, children }: LayoutProps) =>
  html`<!DOCTYPE html>${(
    <html lang={locale}>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
      </head>
      <body>{children}</body>
    </html>
  )}`
