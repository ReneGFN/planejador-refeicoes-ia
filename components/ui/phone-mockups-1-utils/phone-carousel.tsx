import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface ImageItem {
  src: string;
  alt: string;
  label?: string;
}

interface PhoneCarouselProps {
  images: ImageItem[];
  className?: string;
}

export function PhoneCarousel({ images, className }: PhoneCarouselProps) {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (active >= images.length) setActive(0);
  }, [active, images.length]);

  if (!images.length) return null;

  const select = (next: number) => {
    setDirection(next > active ? 1 : -1);
    setActive((next + images.length) % images.length);
  };

  return (
    <section className={cn("phone-showcase", className)} aria-label="Demonstração das telas do Refeição Fácil">
      <div className="phone-showcase-copy">
        <p className="eyebrow">Tour do aplicativo</p>
        <h1>Refeição Fácil, tela por tela</h1>
        <p>Veja o fluxo real do PWA em um formato pronto para apresentação.</p>
      </div>

      <div className="phone-stage">
        <button className="phone-control" type="button" aria-label="Tela anterior" onClick={() => select(active - 1)}>
          <ChevronLeft aria-hidden="true" />
        </button>

        <div className="phone-device" aria-live="polite">
          <div className="phone-speaker" aria-hidden="true" />
          <div className="phone-screen">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.img
                key={images[active].src}
                src={images[active].src}
                alt={images[active].alt}
                custom={direction}
                initial={{ opacity: 0, x: direction * 36 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -36 }}
                transition={{ type: "spring", stiffness: 280, damping: 28 }}
                draggable={false}
              />
            </AnimatePresence>
          </div>
        </div>

        <button className="phone-control" type="button" aria-label="Próxima tela" onClick={() => select(active + 1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div className="phone-caption">
        <strong>{images[active].label ?? images[active].alt}</strong>
        <span>{active + 1} de {images.length}</span>
      </div>
      <div className="phone-dots" role="tablist" aria-label="Selecionar uma tela">
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-label={`Mostrar ${image.label ?? image.alt}`}
            onClick={() => select(index)}
          />
        ))}
      </div>
    </section>
  );
}
