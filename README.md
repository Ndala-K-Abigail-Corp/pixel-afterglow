# Pixel Afterglow

*Old-school joy. New ways to play.*

Pixel Afterglow is a retro-inspired browser gaming platform featuring classic arcade games and casual puzzles, built with modern web technologies.

## Games

### Available Games
- **Tic-Tac-Toe** – A classic strategy game supporting local two-player and computer opponent modes.
- **Memory Match** – A card-matching game featuring Time Challenge and Limited Moves modes across Easy, Medium, and Hard difficulties.

### Upcoming Games
The following titles are planned for future releases and are not yet playable:
- Snake
- Word Guess
- Brick Breaker
- Whack-a-Mole
- Space Shooter
- Hangman
- Letter Rush

## Technology Stack

- **React** – UI component library
- **TypeScript** – Static type checking
- **Vite** – Frontend build tool and development server
- **CSS (Tailwind CSS)** – Responsive styling and retro arcade theming
- **ESLint** – Code linting and quality rules
- **Vitest** – Automated unit and gameplay testing
- **GitHub Actions** – Continuous Integration (CI)
- **Vercel** – Hosting and Continuous Deployment (CD)

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or higher recommended) and npm

### Installation

```bash
git clone https://github.com/Ndala-K-Abigail-Corp/pixel-afterglow.git
cd pixel-afterglow
npm ci
npm run dev
```

The development server runs at `http://localhost:3000`.

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript validation |
| `npm test` | Run automated tests |
| `npm run test:watch` | Run tests in watch mode |

## Development and Quality Checks

GitHub Actions automatically runs Continuous Integration checks on pushes and pull requests to `main`, including linting, TypeScript validation, automated tests, and production builds. Hosting and preview/production deployments are managed through Vercel.

## Contributing

1. Fork the repository or create a feature branch.
2. Make your changes while preserving existing games and functionality.
3. Run the quality checks locally (`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`).
4. Submit a pull request with a clear description of your changes.

## License

No open-source license has been specified for this repository.
