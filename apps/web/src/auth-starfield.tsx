import "./auth-starfield.css";

const stars = Array.from({ length: 96 }, (_, index) => {
  const random = (seed: number) => {
    const value = Math.sin(seed * 127.1 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  };
  return {
    x: 2 + random(index * 3 + 1) * 96,
    y: 2 + random(index * 3 + 2) * 96,
    size: index % 13 === 0 ? 1.5 : index % 5 === 0 ? 1.1 : 0.7,
    opacity: 0.13 + random(index * 3 + 3) * 0.38,
    delay: random(index + 300) * -30,
    duration: 18 + random(index + 600) * 24,
  };
});

export function AuthStarfield() {
  return <div className="auth-starfield" aria-hidden="true">
    {stars.map((star, index) => <span key={index} style={{
      left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size,
      opacity: star.opacity, animationDelay: `${star.delay}s`, animationDuration: `${star.duration}s`,
    }} />)}
  </div>;
}
