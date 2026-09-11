import './styles.css';
import { mountApp } from './app';

const app = document.querySelector<HTMLDivElement>('#app');
const gameRoot = document.querySelector<HTMLDivElement>('#game-root');
if (!app || !gameRoot) throw new Error('Missing application root elements');
mountApp(app, gameRoot);
