const cards = Array.from(document.querySelectorAll(".project"));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (!reduceMotion.matches) {
  cards.forEach((card, index) => {
    card.style.setProperty("--float-delay", `${index * -2.4}s`);
  });
}
