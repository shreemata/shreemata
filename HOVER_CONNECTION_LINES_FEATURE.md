# Hover Connection Lines Feature

## Overview
Implemented hover-based connection line visibility for the referral tree visualization. Connection lines are now hidden by default for a clean view, and only appear when hovering over or long-pressing a card.

## Features Implemented

### 1. **Hidden by Default**
- All connection lines have `opacity: 0` by default
- Provides a clean, uncluttered tree view
- Lines only appear when needed

### 2. **Hover to Show Connections (Desktop)**
- When you hover your mouse over any card, its connection lines appear
- Parent connections highlighted in **red**
- Child connections highlighted in **green**
- The connection lines themselves appear in **blue with glow effect**

### 3. **Long Press for Mobile**
- Touch and hold any card for 500ms to show its connections
- Same visual feedback as desktop hover
- Automatically clears when you lift your finger

### 4. **Visual Feedback**
- Hovered card: Blue border with enhanced shadow
- Parent nodes: Red border and shadow
- Child nodes: Green border and shadow
- Connection lines: Blue stroke with glow effect

### 5. **Auto-Clear**
- Connections automatically hide when mouse leaves the card
- Touch release clears the connections
- Click on background also clears all highlights

## How It Works

### CSS Implementation
```css
/* Lines hidden by default */
.tree-connection-svg line {
    opacity: 0;
    transition: opacity 0.3s ease;
}

/* Show when highlighted */
.tree-connection-svg line.highlighted {
    opacity: 1;
    stroke: #667eea !important;
    stroke-width: 4 !important;
    filter: drop-shadow(0 2px 8px rgba(102, 126, 234, 0.4));
}
```

### JavaScript Implementation
```javascript
// Hover event handlers
node.addEventListener('mouseenter', handleNodeHover);
node.addEventListener('mouseleave', handleNodeLeave);

// Long press for mobile (500ms)
node.addEventListener('touchstart', (e) => {
    longPressTimer = setTimeout(() => {
        handleNodeHover.call(node, e);
    }, 500);
});
```

### Connection Highlighting Logic
1. When hovering over a card, `handleNodeHover` is called
2. Function finds all connection lines where this card is parent or child
3. Adds `highlighted` class to relevant lines
4. Highlights connected parent/child nodes with colored borders
5. On mouse leave, `handleNodeLeave` clears all highlights

## User Instructions

**Desktop:**
- Hover your mouse over any card to see its connections
- Move mouse away to hide connections

**Mobile:**
- Touch and hold any card for half a second
- Connections will appear
- Release to hide connections

**View Details:**
- Click any card to open detailed modal with full information

## Technical Details

### Data Attributes
Each connection line has:
- `data-parent-id`: ID of the parent node
- `data-child-id`: ID of the child node

This allows efficient lookup and highlighting of specific connections.

### Performance
- Uses CSS transitions for smooth animations
- Event delegation for efficient event handling
- Hardware acceleration with `transform: translateZ(0)`
- Optimized for trees with 2000+ users

## Files Modified
- `public/admin-referral-tree-visual.html`
  - Updated CSS for hidden connection lines
  - Added hover/long press event handlers
  - Implemented connection highlighting logic
  - Updated user instructions

## Testing Checklist
- [x] Hover shows connections on desktop
- [x] Long press shows connections on mobile
- [x] Connections hide when mouse leaves
- [x] Parent nodes highlighted in red
- [x] Child nodes highlighted in green
- [x] Connection lines appear in blue
- [x] Click opens modal (doesn't interfere with hover)
- [x] Background click clears highlights
- [x] Works with virtualization enabled
- [x] Works with full tree rendering
- [x] No syntax errors

## Future Enhancements
- Add keyboard navigation (arrow keys to move between nodes)
- Add "Show All Connections" toggle button
- Add connection line animation (flowing dots)
- Add connection strength indicator (line thickness based on commission)
