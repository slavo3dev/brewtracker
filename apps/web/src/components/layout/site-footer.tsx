const FOOTER_LINKS = [
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Support", href: "#" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-latte-200 bg-latte-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 text-[12px] text-steam-400 sm:flex-row">
          <p>
            &copy; {new Date().getFullYear()} Reliant. All rights reserved.{" "}
            <span className="text-steam-300">
              Powered by{" "}
              <a
                href="https://prototypenext.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-steam-400 transition-colors hover:text-copper-600"
              >
                Prototype.NEXT
              </a>{" "}
              &amp;{" "}
              <a
                href="https://slavo.io"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-steam-400 transition-colors hover:text-copper-600"
              >
                Slavo.io
              </a>
            </span>
          </p>
          <ul className="flex items-center gap-6">
            {FOOTER_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} className="transition-colors hover:text-espresso-800">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
