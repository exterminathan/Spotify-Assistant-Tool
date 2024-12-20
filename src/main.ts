// src/main.ts
// TypeScript Template Starter

globalThis.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const paragraph = document.querySelector('p');
        if (paragraph) {
            paragraph.textContent = 'This text was updated by TypeScript!';
        }
    }, 2000);
});