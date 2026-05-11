interface CharacterQuoteProps {
  quote: string;
  attributedTo: string;
}

export function CharacterQuote({ quote, attributedTo }: CharacterQuoteProps) {
  return (
    <figure
      data-testid="character-quote"
      className="mt-8 border-l-2 border-primary-500 pl-5"
    >
      <blockquote className="font-serif text-xl italic leading-relaxed text-dark-text-100 md:text-2xl">
        &ldquo;{quote}&rdquo;
      </blockquote>
      <figcaption className="mt-3 text-xs uppercase tracking-[0.2em] text-dark-text-200">
        — {attributedTo}
      </figcaption>
    </figure>
  );
}
