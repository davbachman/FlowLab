import type { Program } from './types'

export const processBasicsProgram: Program = {
  version: 1,
  nodes: [
    { id: 'process-main', type: 'function', text: 'main', position: { x: 240, y: 20 } },
    {
      id: 'calculate-area',
      type: 'process',
      text:
        'width <- 8\nheight <- 5\narea <- width * height\nlabel <- "Area: " + area',
      position: { x: 195, y: 140 },
    },
    {
      id: 'show-area',
      type: 'output',
      text: 'label',
      position: { x: 240, y: 310 },
    },
    {
      id: 'process-return',
      type: 'return',
      text: 'area',
      position: { x: 240, y: 430 },
    },
  ],
  edges: [
    { id: 'process-main-calculate', source: 'process-main', target: 'calculate-area' },
    { id: 'process-calculate-show', source: 'calculate-area', target: 'show-area' },
    { id: 'process-show-return', source: 'show-area', target: 'process-return' },
  ],
}

export const numberGuessProgram: Program = {
  version: 1,
  nodes: [
    { id: 'guess-main', type: 'function', text: 'main', position: { x: 320, y: 20 } },
    {
      id: 'guess-prompt',
      type: 'output',
      text: '"Guess a number between 0 and 1"',
      position: { x: 320, y: 130 },
    },
    {
      id: 'make-guess',
      type: 'process',
      text: 'target <- rand()\nguess <- ask()',
      position: { x: 275, y: 240 },
    },
    {
      id: 'guess-low-check',
      type: 'if',
      text: 'guess < target',
      position: { x: 311, y: 390 },
    },
    {
      id: 'guess-low',
      type: 'output',
      text: '"Too low. The number was " + target',
      position: { x: 20, y: 550 },
    },
    {
      id: 'guess-high-check',
      type: 'if',
      text: 'guess > target',
      position: { x: 500, y: 550 },
    },
    {
      id: 'guess-high',
      type: 'output',
      text: '"Too high. The number was " + target',
      position: { x: 330, y: 720 },
    },
    {
      id: 'guess-correct',
      type: 'output',
      text: '"Correct! The number was " + target',
      position: { x: 650, y: 720 },
    },
    {
      id: 'guess-return',
      type: 'return',
      text: 'target',
      position: { x: 320, y: 870 },
    },
  ],
  edges: [
    { id: 'guess-main-prompt', source: 'guess-main', target: 'guess-prompt' },
    { id: 'guess-prompt-make', source: 'guess-prompt', target: 'make-guess' },
    { id: 'guess-make-low-check', source: 'make-guess', target: 'guess-low-check' },
    {
      id: 'guess-low-branch',
      source: 'guess-low-check',
      target: 'guess-low',
      label: 'true',
    },
    {
      id: 'guess-not-low',
      source: 'guess-low-check',
      target: 'guess-high-check',
      label: 'false',
    },
    {
      id: 'guess-high-branch',
      source: 'guess-high-check',
      target: 'guess-high',
      label: 'true',
    },
    {
      id: 'guess-correct-branch',
      source: 'guess-high-check',
      target: 'guess-correct',
      label: 'false',
    },
    { id: 'guess-low-return', source: 'guess-low', target: 'guess-return' },
    { id: 'guess-high-return', source: 'guess-high', target: 'guess-return' },
    { id: 'guess-correct-return', source: 'guess-correct', target: 'guess-return' },
  ],
}

export const listStatisticsProgram: Program = {
  version: 1,
  nodes: [
    { id: 'stats-main', type: 'function', text: 'main', position: { x: 390, y: 20 } },
    {
      id: 'stats-setup',
      type: 'process',
      text:
        'values <- [4, 8, 1, 6, 3]\ntotal <- 0\ncount <- 0\nlargest <- values[0]',
      position: { x: 345, y: 130 },
    },
    {
      id: 'stats-loop',
      type: 'for',
      text: 'item in values',
      position: { x: 381, y: 320 },
    },
    {
      id: 'stats-accumulate',
      type: 'process',
      text: 'total <- total + item\ncount <- count + 1',
      position: { x: 20, y: 470 },
    },
    {
      id: 'stats-largest-check',
      type: 'if',
      text: 'item > largest',
      position: { x: 56, y: 630 },
    },
    {
      id: 'stats-set-largest',
      type: 'process',
      text: 'largest <- item',
      position: { x: -230, y: 800 },
    },
    {
      id: 'stats-finish',
      type: 'process',
      text:
        'average <- total / count\nstats <- {"count": count, "sum": total, "largest": largest, "average": average}',
      position: { x: 345, y: 520 },
    },
    {
      id: 'stats-output',
      type: 'output',
      text: 'stats',
      position: { x: 390, y: 700 },
    },
    {
      id: 'stats-return',
      type: 'return',
      text: 'stats',
      position: { x: 390, y: 820 },
    },
  ],
  edges: [
    { id: 'stats-main-setup', source: 'stats-main', target: 'stats-setup' },
    { id: 'stats-setup-loop', source: 'stats-setup', target: 'stats-loop' },
    {
      id: 'stats-loop-body',
      source: 'stats-loop',
      target: 'stats-accumulate',
      label: 'true',
    },
    {
      id: 'stats-loop-finish',
      source: 'stats-loop',
      target: 'stats-finish',
      label: 'false',
    },
    {
      id: 'stats-accumulate-check',
      source: 'stats-accumulate',
      target: 'stats-largest-check',
    },
    {
      id: 'stats-update-largest',
      source: 'stats-largest-check',
      target: 'stats-set-largest',
      label: 'true',
    },
    {
      id: 'stats-keep-largest',
      source: 'stats-largest-check',
      target: 'stats-loop',
      label: 'false',
    },
    {
      id: 'stats-largest-loop',
      source: 'stats-set-largest',
      target: 'stats-loop',
    },
    { id: 'stats-finish-output', source: 'stats-finish', target: 'stats-output' },
    { id: 'stats-output-return', source: 'stats-output', target: 'stats-return' },
  ],
}

export const dictionaryInventoryProgram: Program = {
  version: 1,
  nodes: [
    { id: 'inventory-main', type: 'function', text: 'main', position: { x: 320, y: 20 } },
    {
      id: 'inventory-setup',
      type: 'process',
      text:
        'inventory <- {"apples": 3, "oranges": 4}\ninventory["apples"] <- inventory["apples"] + 2\ninventory["bread"] <- 1',
      position: { x: 275, y: 140 },
    },
    {
      id: 'inventory-loop',
      type: 'for',
      text: 'item in inventory',
      position: { x: 311, y: 330 },
    },
    {
      id: 'inventory-item-output',
      type: 'output',
      text: 'item + ": " + inventory[item]',
      position: { x: 20, y: 500 },
    },
    {
      id: 'inventory-summary',
      type: 'output',
      text: '"Apple stock after delivery: " + inventory["apples"]',
      position: { x: 320, y: 520 },
    },
    {
      id: 'inventory-return',
      type: 'return',
      text: 'inventory',
      position: { x: 320, y: 650 },
    },
  ],
  edges: [
    { id: 'inventory-main-setup', source: 'inventory-main', target: 'inventory-setup' },
    { id: 'inventory-setup-loop', source: 'inventory-setup', target: 'inventory-loop' },
    {
      id: 'inventory-loop-item',
      source: 'inventory-loop',
      target: 'inventory-item-output',
      label: 'true',
    },
    {
      id: 'inventory-loop-summary',
      source: 'inventory-loop',
      target: 'inventory-summary',
      label: 'false',
    },
    {
      id: 'inventory-item-loop',
      source: 'inventory-item-output',
      target: 'inventory-loop',
    },
    {
      id: 'inventory-summary-return',
      source: 'inventory-summary',
      target: 'inventory-return',
    },
  ],
}

export const bankAccountProgram: Program = {
  version: 1,
  nodes: [
    {
      id: 'account-class',
      type: 'class',
      text: 'Account(owner, balance)',
      position: { x: 310, y: 20 },
    },
    {
      id: 'account-deposit',
      type: 'method',
      text: 'deposit',
      position: { x: 20, y: 220 },
    },
    {
      id: 'deposit-amount',
      type: 'input',
      text: 'amount',
      position: { x: 20, y: 330 },
    },
    {
      id: 'deposit-update',
      type: 'process',
      text: 'balance <- balance + amount',
      position: { x: -25, y: 440 },
    },
    {
      id: 'deposit-return',
      type: 'return',
      text: 'balance',
      position: { x: 20, y: 580 },
    },
    {
      id: 'account-withdraw',
      type: 'method',
      text: 'withdraw',
      position: { x: 350, y: 220 },
    },
    {
      id: 'withdraw-amount',
      type: 'input',
      text: 'amount',
      position: { x: 350, y: 330 },
    },
    {
      id: 'withdraw-check',
      type: 'if',
      text: 'amount <= balance',
      position: { x: 341, y: 440 },
    },
    {
      id: 'withdraw-update',
      type: 'process',
      text: 'balance <- balance - amount',
      position: { x: 100, y: 610 },
    },
    {
      id: 'withdraw-success-return',
      type: 'return',
      text: 'balance',
      position: { x: 145, y: 750 },
    },
    {
      id: 'withdraw-rejected-output',
      type: 'output',
      text: '"Insufficient funds"',
      position: { x: 570, y: 610 },
    },
    {
      id: 'withdraw-rejected-return',
      type: 'return',
      text: 'balance',
      position: { x: 570, y: 750 },
    },
    {
      id: 'account-repr',
      type: 'method',
      text: '__repr__',
      position: { x: 720, y: 220 },
    },
    {
      id: 'account-repr-return',
      type: 'return',
      text: 'owner + ": $" + balance',
      position: { x: 720, y: 340 },
    },
    {
      id: 'account-main',
      type: 'function',
      text: 'main',
      position: { x: 1030, y: 20 },
    },
    {
      id: 'account-demo',
      type: 'process',
      text:
        'account <- Account("Ada", 100)\naccount.deposit(25)\naccount.withdraw(40)',
      position: { x: 985, y: 140 },
    },
    {
      id: 'account-output',
      type: 'output',
      text: 'account',
      position: { x: 1030, y: 320 },
    },
    {
      id: 'account-return',
      type: 'return',
      text: 'account',
      position: { x: 1030, y: 440 },
    },
  ],
  edges: [
    { id: 'account-deposit-method', source: 'account-class', target: 'account-deposit' },
    { id: 'account-withdraw-method', source: 'account-class', target: 'account-withdraw' },
    { id: 'account-repr-method', source: 'account-class', target: 'account-repr' },
    { id: 'deposit-method-input', source: 'account-deposit', target: 'deposit-amount' },
    { id: 'deposit-input-update', source: 'deposit-amount', target: 'deposit-update' },
    { id: 'deposit-update-return', source: 'deposit-update', target: 'deposit-return' },
    { id: 'withdraw-method-input', source: 'account-withdraw', target: 'withdraw-amount' },
    { id: 'withdraw-input-check', source: 'withdraw-amount', target: 'withdraw-check' },
    {
      id: 'withdraw-allowed',
      source: 'withdraw-check',
      target: 'withdraw-update',
      label: 'true',
    },
    {
      id: 'withdraw-rejected',
      source: 'withdraw-check',
      target: 'withdraw-rejected-output',
      label: 'false',
    },
    { id: 'withdraw-update-return', source: 'withdraw-update', target: 'withdraw-success-return' },
    {
      id: 'withdraw-output-return',
      source: 'withdraw-rejected-output',
      target: 'withdraw-rejected-return',
    },
    { id: 'account-repr-body', source: 'account-repr', target: 'account-repr-return' },
    { id: 'account-main-demo', source: 'account-main', target: 'account-demo' },
    { id: 'account-demo-output', source: 'account-demo', target: 'account-output' },
    { id: 'account-output-return', source: 'account-output', target: 'account-return' },
  ],
}

export const turtlePolygonProgram: Program = {
  version: 1,
  nodes: [
    { id: 'polygon-main', type: 'function', text: 'main', position: { x: 320, y: 20 } },
    {
      id: 'polygon-setup',
      type: 'process',
      text: 'sides <- 5\nlength <- 80\nturn <- 360 / sides',
      position: { x: 275, y: 140 },
    },
    {
      id: 'polygon-loop',
      type: 'for',
      text: 'side in [1, 2, 3, 4, 5]',
      position: { x: 311, y: 320 },
    },
    {
      id: 'polygon-draw',
      type: 'process',
      text: 'forward(length)\nright(turn)',
      position: { x: 20, y: 490 },
    },
    {
      id: 'polygon-return',
      type: 'return',
      text: '0',
      position: { x: 320, y: 520 },
    },
  ],
  edges: [
    { id: 'polygon-main-setup', source: 'polygon-main', target: 'polygon-setup' },
    { id: 'polygon-setup-loop', source: 'polygon-setup', target: 'polygon-loop' },
    {
      id: 'polygon-loop-draw',
      source: 'polygon-loop',
      target: 'polygon-draw',
      label: 'true',
    },
    {
      id: 'polygon-loop-return',
      source: 'polygon-loop',
      target: 'polygon-return',
      label: 'false',
    },
    { id: 'polygon-draw-loop', source: 'polygon-draw', target: 'polygon-loop' },
  ],
}
