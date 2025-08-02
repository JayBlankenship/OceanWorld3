import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { createPlayerPawn } from './playerPawn.js';
import { createShipPawn } from './shipPawn.js';

export function createAIPlayer() {
    // Create AI ship with isAI=true to get purple color and no keyboard controls
    const aiPawn = createShipPawn(true);
    
    // Set random starting position
    aiPawn.position.set(
        (Math.random() - 0.5) * 40, // Random x position (-20 to 20)
        0,
        (Math.random() - 0.5) * 40  // Random z position (-20 to 20)
    );

    // AI behavior variables
    let currentDirection = new THREE.Vector3();
    let decisionTimer = 0;
    let changeDirectionInterval = 2 + Math.random() * 3; // 2-5 seconds
    let isSurgeActive = false;
    let surgeCooldown = 0;
    const aiSpeed = 3.5; // Slightly slower than player

    // Random movement direction
    function chooseNewDirection() {
        // Sometimes stand still (20% chance)
        if (Math.random() < 0.2) {
            currentDirection.set(0, 0, 0);
        } else {
            // Random direction
            const angle = Math.random() * Math.PI * 2;
            currentDirection.set(Math.sin(angle), 0, Math.cos(angle)).normalize();
        }
        decisionTimer = 0;
        changeDirectionInterval = 2 + Math.random() * 3; // New interval
    }

    // Random surge activation with more intelligent timing
    function updateSurgeState(deltaTime) {
        surgeCooldown -= deltaTime;
        
        if (surgeCooldown <= 0) {
            // Higher chance to surge when moving (50% vs 10% when idle)
            const surgeChance = currentDirection.length() > 0 ? 0.5 : 0.1;
            
            if (Math.random() < deltaTime * surgeChance) {
                isSurgeActive = true;
                surgeCooldown = 0.5 + Math.random(); // Short active period (0.5-1.5s)
            }
        } else {
            isSurgeActive = false;
        }
        
        // Update the pawn's surge state
        aiPawn.setSurge(isSurgeActive);
    }

    aiPawn.updateAI = function(deltaTime, animationTime) {
        // Update decision timer
        decisionTimer += deltaTime;
        if (decisionTimer > changeDirectionInterval) {
            chooseNewDirection();
        }

        // Update surge state
        updateSurgeState(deltaTime);

        // Move the AI pawn
        const currentSpeed = isSurgeActive ? aiSpeed * 1.5 : aiSpeed;
        aiPawn.position.x += currentDirection.x * currentSpeed * deltaTime;
        aiPawn.position.z += currentDirection.z * currentSpeed * deltaTime;

        // Call the original update for animations (star will update automatically)
        aiPawn.update(deltaTime, animationTime);
    };

    return aiPawn;
}