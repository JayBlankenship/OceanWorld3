import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { createPlayerPawn } from './playerPawn.js';
import { createShipPawn } from './shipPawn.js';
// --- GLOBAL OCEAN MESH ---
let globalOcean = null;
let globalOceanGeometry = null;
let globalOceanSegments = 64;
let globalOceanTime = Math.random() * 1000;
let globalOceanWaveState = {
    amp: 0.8, // More intense default amplitude
    speed: 2.0, // Faster default speed
    targetAmp: 0.8,
    targetSpeed: 2.0,
    timer: 0,
    storms: [], // Array of active storm systems
    stormIntensity: 0.5, // Global storm intensity factor
    maxStorms: 4 // Allow more simultaneous storms
};
let globalOceanSize = 120;

// Make ocean variables globally accessible for ship synchronization
window.globalOceanTime = globalOceanTime;
window.globalOceanWaveState = globalOceanWaveState;

function createGlobalOcean(scene, size = 120, segments = 64) {
    // Create a large transparent ocean surface that sits above the terrain
    size = 2400; // Doubled from 1200
    segments = 128; // Reduced for better performance but still smooth
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    
    // Add vertex colors for enhanced depth effect with multiple gradients
    const colors = [];
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const distanceFromCenter = Math.sqrt(x * x + z * z);
        const maxDistance = size * 0.4;
        const depthFactor = Math.min(distanceFromCenter / maxDistance, 1.0);
        
        // Enhanced depth gradient with dramatic color transitions and storm effects
        // Base ocean colors - darker blue variations
        const calmShallowR = 0.0, calmShallowG = 0.3, calmShallowB = 0.7; // Dark blue
        const calmDeepR = 0.0, calmDeepG = 0.05, calmDeepB = 0.3; // Very dark navy
        
        // Storm colors - greens, grays, and darker blues emerge during storms
        const stormShallowR = 0.1, stormShallowG = 0.4, stormShallowB = 0.5; // Stormy blue-green
        const stormDeepR = 0.05, stormDeepG = 0.15, stormDeepB = 0.2; // Dark gray-blue
        
        // Foam and turbulence colors - whites and light blues
        const foamR = 0.8, foamG = 0.9, foamB = 1.0; // White foam
        const turbulenceR = 0.4, turbulenceG = 0.6, turbulenceB = 0.8; // Light stormy blue
        
        // Calculate storm intensity at this location
        let stormIntensity = 0;
        const globalStormFactor = Math.sin(x * 0.002 + z * 0.003) * Math.cos(x * 0.001 - z * 0.004);
        stormIntensity = Math.max(0, globalStormFactor * 0.5 + 0.3); // Always some storm potential
        
        // Distance-based storm variation - storms can be more intense in different areas
        const distanceStorm = Math.sin(distanceFromCenter * 0.001) * 0.3;
        stormIntensity += distanceStorm;
        stormIntensity = Math.max(0, Math.min(1, stormIntensity));
        
        // Multiple wave-based color layers for texture with storm enhancement
        const wavePattern1 = Math.sin(x * 0.008) * Math.cos(z * 0.012) * (0.04 + stormIntensity * 0.06); // Large waves - storm enhanced
        const wavePattern2 = Math.sin(x * 0.025 + z * 0.018) * (0.025 + stormIntensity * 0.04); // Medium waves
        const wavePattern3 = Math.sin(x * 0.045) * Math.cos(z * 0.038) * (0.015 + stormIntensity * 0.03); // Small ripples
        const wavePattern4 = Math.cos(x * 0.06 + z * 0.052) * (0.01 + stormIntensity * 0.02); // Fine detail
        
        // Foam/whitecap simulation - much stronger during storms
        const foamPattern = Math.sin(x * 0.1) * Math.cos(z * 0.08) * (1 - depthFactor) * (0.02 + stormIntensity * 0.08);
        
        // Turbulence patterns that emerge during storms
        const turbulencePattern1 = Math.sin(x * 0.15) * Math.cos(z * 0.12) * stormIntensity * 0.05;
        const turbulencePattern2 = Math.cos(x * 0.2 + z * 0.18) * stormIntensity * 0.03;
        
        // Combine all wave patterns
        const totalWaveEffect = (wavePattern1 + wavePattern2 + wavePattern3 + wavePattern4) * (1 - depthFactor * 0.4);
        const totalFoamEffect = foamPattern + turbulencePattern1 + turbulencePattern2;
        
        // Additional color variation for natural look with storm chaos
        const colorVariation1 = Math.sin(x * 0.03 + z * 0.04) * (0.015 + stormIntensity * 0.025);
        const colorVariation2 = Math.cos(x * 0.07 - z * 0.02) * (0.01 + stormIntensity * 0.02);
        const stormChaos = Math.sin(x * 0.08 + z * 0.09) * Math.cos(x * 0.11 - z * 0.07) * stormIntensity * 0.04;
        
        // Interpolate between calm and storm colors based on storm intensity
        const baseShallowR = calmShallowR + (stormShallowR - calmShallowR) * stormIntensity;
        const baseShallowG = calmShallowG + (stormShallowG - calmShallowG) * stormIntensity;
        const baseShallowB = calmShallowB + (stormShallowB - calmShallowB) * stormIntensity;
        
        const baseDeepR = calmDeepR + (stormDeepR - calmDeepR) * stormIntensity;
        const baseDeepG = calmDeepG + (stormDeepG - calmDeepG) * stormIntensity;
        const baseDeepB = calmDeepB + (stormDeepB - calmDeepB) * stormIntensity;
        
        // Apply depth gradient with storm colors
        let r = baseShallowR + (baseDeepR - baseShallowR) * depthFactor;
        let g = baseShallowG + (baseDeepG - baseShallowG) * depthFactor;
        let b = baseShallowB + (baseDeepB - baseShallowB) * depthFactor;
        
        // Add wave effects
        r += totalWaveEffect * 0.3 + colorVariation1 + stormChaos;
        g += totalWaveEffect * 0.4 + colorVariation2 + stormChaos * 0.5;
        b += totalWaveEffect * 0.2 + stormChaos * 0.3;
        
        // Add foam/turbulence effects (lighter colors)
        const foamStrength = Math.max(0, totalFoamEffect);
        r += foamStrength * foamR * 0.3;
        g += foamStrength * foamG * 0.3;
        b += foamStrength * foamB * 0.3;
        
        // Add turbulence coloring (stormy blues and greens)
        r += stormIntensity * turbulenceR * 0.1;
        g += stormIntensity * turbulenceG * 0.15;
        b += stormIntensity * turbulenceB * 0.1;
        
        colors.push(Math.max(0, Math.min(1, r)), Math.max(0, Math.min(1, g)), Math.max(0, Math.min(1, b)));
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = new THREE.MeshLambertMaterial({
        vertexColors: true, // Use vertex colors for enhanced depth effect
        wireframe: false, // Solid surface, not wireframe
        transparent: true, // Add slight transparency for depth perception
        opacity: 0.75, // Subtle transparency to match terrain planes
        side: THREE.DoubleSide, // Render both sides to prevent culling
        // Enhanced cartoon water surface with sparkles
        emissive: 0x002255, // Stronger magical blue glow
        emissiveIntensity: 0.2, // Higher intensity for cartoon sparkle effect
        shininess: 120 // Very reflective cartoon water surface
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 20.0, 0); // Position ocean surface properly relative to player height
    mesh.name = "globalOceanSurface"; // Add name for debugging
    scene.add(mesh);
    console.log("Ocean surface created at position:", mesh.position, "with opacity:", material.opacity);
    globalOcean = mesh;
    globalOceanGeometry = geometry;
    globalOceanSegments = segments;
    globalOceanSize = size;
}
import { createStar } from './star.js';
import { createAIPlayer } from './ai.js';
import { TerrainPlane } from './terrainPlane.js';
import { TerrainGenerator } from './terrainGenerator.js'; // Import the new class
import { NetworkedPlayerManager } from './networkedPlayer.js'; // Import networked player system

const canvas = document.getElementById('gameCanvas');
const startButton = document.getElementById('startButton');
const menu = document.getElementById('menu');
const pauseMenu = document.getElementById('pauseMenu');
const closeMenuButton = document.getElementById('closeMenu');
const instructions = document.getElementById('instructions');
const thetaSensitivityInput = document.getElementById('thetaSensitivity');
const phiSensitivityInput = document.getElementById('phiSensitivity');

// Global state
let isInstructionsVisible = true;
let isGamePaused = false;
let isSettingsOpen = false;

// Global functions for menu controls
window.resumeGame = function() {
    isGamePaused = false;
    pauseMenu.style.display = 'none';
    if (!document.pointerLockElement) {
        canvas.requestPointerLock();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    startButton.addEventListener('click', () => {
        startButton.style.display = 'none';
        canvas.style.display = 'block';
        initGame();
    });
});

// Load saved settings on page load
function loadSettings() {
    const savedTheta = localStorage.getItem('thetaSensitivity');
    const savedPhi = localStorage.getItem('phiSensitivity');
    if (savedTheta) thetaSensitivityInput.value = savedTheta;
    if (savedPhi) phiSensitivityInput.value = savedPhi;
}

function initGame() {
    const scene = new THREE.Scene();
    
    // Set a simple sky color background
    scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    
    // === SIMPLE LOW-COST LIGHTING SETUP ===
    
    // Ambient light - provides soft overall illumination
    const ambientLight = new THREE.AmbientLight(0x404080, 0.4); // Soft blue ambient light
    scene.add(ambientLight);
    
    // Directional light - simulates sunlight
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 50); // High in the sky
    directionalLight.castShadow = false; // Keep shadows off for performance
    scene.add(directionalLight);
    
    // Optional: Add a subtle second light for fill lighting
    const fillLight = new THREE.DirectionalLight(0x87ceeb, 0.3); // Sky blue fill light
    fillLight.position.set(-50, 100, -100); // From opposite direction
    fillLight.castShadow = false;
    scene.add(fillLight);
    
    // Add global animated ocean mesh (wireframe, ripple effect)
    createGlobalOcean(scene, 120, 64);
    // Increase far plane to 5000 and near plane to 1.0 for large world and high ocean
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1.0, 5000);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Create ship pawn and star
    const playerPawn = createShipPawn(false); // false indicates human player
    scene.add(playerPawn);

    // Initialize networked player manager for red replicated players
    const networkedPlayerManager = new NetworkedPlayerManager(scene);
    console.log('[Game] NetworkedPlayerManager initialized');
    
    // Set up network callbacks for player replication once connected
    if (window.Network) {
        // Handle incoming player state updates from other clients
        window.Network.callbacks.handlePlayerState = (peerId, state) => {
            console.log(`[Game] Received player state from ${peerId}:`, state);
            networkedPlayerManager.updatePlayer(peerId, state);
        };
        
        // Track when players join/leave the lobby to create/remove red players
        const originalUpdateUI = window.Network.callbacks.updateUI;
        window.Network.callbacks.updateUI = function(peers) {
            // Call original updateUI if it exists
            if (originalUpdateUI) {
                originalUpdateUI(peers);
            }
            
            // Only create red players if we're in a complete lobby
            if (window.Network.isInCompleteLobby && window.Network.isInCompleteLobby()) {
                const currentPeerIds = window.Network.getLobbyPeerIds();
                const existingPeerIds = Array.from(networkedPlayerManager.networkedPlayers.keys());
                
                console.log(`[Game] Lobby complete! Current peers:`, currentPeerIds);
                console.log(`[Game] Existing networked players:`, existingPeerIds);
                
                // Add new players as red replicated pawns
                for (const peerId of currentPeerIds) {
                    if (!existingPeerIds.includes(peerId)) {
                        console.log(`[Game] Creating RED networked player for peer: ${peerId}`);
                        networkedPlayerManager.addPlayer(peerId);
                    }
                }
                
                // Remove disconnected players
            // Update global player position for exclusion zone logic
            window.playerPosition = playerPawn.position.clone();

            // Update terrain storm system
            if (terrainGenerator && typeof terrainGenerator.updateStormSystem === 'function') {
                terrainGenerator.updateStormSystem(deltaTime, playerPawn.position);
            }

            // Dynamically update terrain tiles with storm effects every frame
            if (terrainGenerator && terrainGenerator.planes && typeof window.updateExclusionZoneEveryFrame === 'function') {
                window.updateExclusionZoneEveryFrame(Array.from(terrainGenerator.planes.values()), terrainGenerator);
            }
                for (const peerId of existingPeerIds) {
                    if (!currentPeerIds.includes(peerId)) {
                        console.log(`[Game] Removing networked player for peer: ${peerId}`);
                        networkedPlayerManager.removePlayer(peerId);
                    }
                }
            }
        };
    }

    // Create multiple AI players
    const numberOfAIPlayers = 0; // Set this to your desired number
    const aiPlayers = []; // Array to store all AI players

    for (let i = 0; i < numberOfAIPlayers; i++) {
        const aiPlayer = createAIPlayer();
        
        // Position in a spiral pattern to avoid clustering
        const angle = (i / numberOfAIPlayers) * Math.PI * 2;
        const radius = 70 + (i % 5) * 5; // Staggered distances
        
        aiPlayer.position.set(
            Math.cos(angle) * radius,
            0,
            Math.sin(angle) * radius
        );
        
        scene.add(aiPlayer);
        aiPlayers.push(aiPlayer);
    }

    // Procedural ground system
    const planeSize = 2;
    const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
    const planeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00FF00, // Neon green
        side: THREE.DoubleSide,
        wireframe: true
    });

    // Initialize TerrainGenerator 
    const terrainGenerator = new TerrainGenerator(scene, planeSize, planeGeometry, planeMaterial);

    // Set up terrain networking callback after terrainGenerator is created - temporarily disabled
    // if (window.Network) {
    //     // Handle incoming terrain changes from other clients
    //     window.Network.callbacks.handleTerrainChanges = (peerId, changes) => {
    //         console.log(`[Game] Received terrain changes from ${peerId}:`, changes);
    //         try {
    //             terrainGenerator.applyTerrainChanges(changes);
    //         } catch (error) {
    //             console.error('[Game] Error applying terrain changes:', error);
    //         }
    //     };
    // }

    // Initial camera position - pulled back further for better ocean view
    camera.position.set(0, 8, -18);
    camera.lookAt(playerPawn.position);

    // Calculate initial theta and phi
    const initialOffset = new THREE.Vector3().subVectors(camera.position, playerPawn.position);
    const r = initialOffset.length();
    let theta = Math.atan2(initialOffset.x, initialOffset.z);
    let phi = Math.atan2(initialOffset.y, Math.sqrt(initialOffset.x ** 2 + initialOffset.z ** 2));

    // Mouse controls with Pointer Lock
    let isPointerLocked = false;
    let mouseX = 0;
    let mouseY = 0;
    let thetaSensitivity = parseFloat(thetaSensitivityInput.value);
    let phiSensitivity = parseFloat(phiSensitivityInput.value);

    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;

    canvas.addEventListener('click', () => {
        if (!isPointerLocked && !menu.style.display) {
            canvas.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        isPointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
        if (isPointerLocked) {
            mouseX = e.movementX || e.mozMovementX || 0;
            mouseY = e.movementY || e.mozMovementY || 0;
        }
    });

    // Update and save sensitivity from sliders
    thetaSensitivityInput.addEventListener('input', (e) => {
        thetaSensitivity = parseFloat(e.target.value);
        localStorage.setItem('thetaSensitivity', thetaSensitivity);
    });
    phiSensitivityInput.addEventListener('input', (e) => {
        phiSensitivity = parseFloat(e.target.value);
        localStorage.setItem('phiSensitivity', phiSensitivity);
    });

    // Load settings when the page loads
    loadSettings();

    // Movement controls
    const moveState = { forward: false, backward: false, left: false, right: false };
    const playerSpeed = 5.0;
    let lastTime = performance.now();
    let isMenuOpen = false;
    let animationTime = 0;

    document.addEventListener('keydown', (e) => {
        const key = e.key.toLowerCase();
        
        // Global hotkeys
        if (key === 'escape') {
            isGamePaused = !isGamePaused;
            pauseMenu.style.display = isGamePaused ? 'block' : 'none';
            if (isGamePaused && isPointerLocked) {
                document.exitPointerLock();
            } else if (!isGamePaused && !isPointerLocked) {
                canvas.requestPointerLock();
            }
        }
        
        if (key === 'f1') {
            isInstructionsVisible = !isInstructionsVisible;
            instructions.classList.toggle('hidden', !isInstructionsVisible);
        }
        
        if (key === 'f2') {
            isSettingsOpen = !isSettingsOpen;
            menu.style.display = isSettingsOpen ? 'block' : 'none';
        }
        
        // Movement controls only when not paused
        if (!isGamePaused && !isSettingsOpen) {
            if (key === 'w') moveState.forward = true;
            if (key === 's') moveState.backward = true;
            if (key === 'a') moveState.left = true;
            if (key === 'd') moveState.right = true;
        }
    });

    document.addEventListener('keyup', (e) => {
        const key = e.key.toLowerCase();
        if (key === 'w') moveState.forward = false;
        if (key === 's') moveState.backward = false;
        if (key === 'a') moveState.left = false;
        if (key === 'd') moveState.right = false;
    });

    closeMenuButton.addEventListener('click', () => {
        isSettingsOpen = false;
        menu.style.display = 'none';
        if (!isPointerLocked) {
            canvas.requestPointerLock();
        }
    });

    // Animation loop
    function animate(currentTime) {
        requestAnimationFrame(animate);
        
        const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
        lastTime = currentTime;
        animationTime += deltaTime;

        // Update player position only if not paused
        if (!isGamePaused && !isSettingsOpen) {
            let direction = new THREE.Vector3();
            camera.getWorldDirection(direction);
            direction.y = 0;
            direction.normalize();

            if (moveState.forward) {
                // Ship movement handled by processInput
            }
            if (moveState.backward) {
                // Ship movement handled by processInput
            }
            if (moveState.left) {
                // Ship movement handled by processInput
            }
            if (moveState.right) {
                // Ship movement handled by processInput
            }
            
            // Process ship input if available
            if (playerPawn.processInput) {
                playerPawn.processInput();
            }

            // Update player pawn and star animations
            // --- Make player pawn float on the true animated ocean surface (including storms) ---
            if (globalOcean && globalOceanGeometry && playerPawn) {
                // Use the exact same logic as the mesh for perfect sync
                function getLocalWaveMultiplier(x, z) {
                    let localAmp = 1.0;
                    let swirlY = 0;
                    if (globalOceanWaveState.storms) {
                        for (let storm of globalOceanWaveState.storms) {
                            const dx = x - storm.x;
                            const dz = z - storm.z;
                            const dist = Math.sqrt(dx * dx + dz * dz);
                            if (dist < storm.radius) {
                                swirlY += Math.sin(storm.swirl + dist * 0.02) * storm.amp * (1 - dist / storm.radius) * 0.5;
                                localAmp = Math.max(localAmp, 1 + (storm.amp - 1) * (1 - dist / storm.radius));
                            }
                        }
                    }
                    const dist = Math.sqrt(x * x + z * z);
                    let base = 1.0;
                    if (dist < 30) base = 0.7;
                    if (dist > 80) base = 1.5;
                    return base * localAmp + swirlY;
                }
                let t = globalOceanTime;
                let px = playerPawn.position.x;
                let pz = playerPawn.position.z;
                let y = 0;
                y += Math.sin(0.09 * px + t * 0.7) * 1.2 * getLocalWaveMultiplier(px, pz);
                y += Math.cos(0.08 * pz + t * 0.5) * 1.0 * getLocalWaveMultiplier(px, pz);
                y += Math.sin(0.07 * (px + pz) + t * 0.3) * 0.7 * getLocalWaveMultiplier(px, pz);
                // Ship handles its own Y position and ocean bobbing
            }
            playerPawn.update(deltaTime, animationTime);

            // --- Animate global ocean mesh (ripple effect) ---
            if (globalOcean && globalOceanGeometry && playerPawn) {
                // --- Storm system: storms can form, move, and swirl toward the player ---
                // Update storms
                if (!globalOceanWaveState.storms) globalOceanWaveState.storms = [];
                // More frequent storm spawning with higher intensity
                if (Math.random() < deltaTime * 0.08 && globalOceanWaveState.storms.length < globalOceanWaveState.maxStorms) {
                    // Storms spawn closer and more frequently
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 800 + Math.random() * 1500; // Closer storms
                    globalOceanWaveState.storms.push({
                        x: playerPawn.position.x + Math.cos(angle) * dist,
                        z: playerPawn.position.z + Math.sin(angle) * dist,
                        amp: 3 + Math.random() * 5, // Much more intense waves (was 2-5, now 3-8)
                        radius: 600 + Math.random() * 800, // Larger storm radius
                        swirl: Math.random() * Math.PI * 2,
                        swirlSpeed: 0.2 + Math.random() * 0.4, // Faster swirling
                        moveSpeed: 4 + Math.random() * 6, // Faster moving storms
                        target: { x: playerPawn.position.x, z: playerPawn.position.z },
                        age: 0,
                        intensity: 0.7 + Math.random() * 0.3 // Storm color intensity
                    });
                }
                // Move storms toward the player, swirl them
                for (let storm of globalOceanWaveState.storms) {
                    // Swirl around their center
                    storm.swirl += storm.swirlSpeed * deltaTime;
                    // Move toward player
                    const dx = playerPawn.position.x - storm.x;
                    const dz = playerPawn.position.z - storm.z;
                    const d = Math.sqrt(dx * dx + dz * dz);
                    if (d > 10) {
                        storm.x += (dx / d) * storm.moveSpeed * deltaTime;
                        storm.z += (dz / d) * storm.moveSpeed * deltaTime;
                    }
                    storm.age += deltaTime;
                }
                // Remove old storms
                globalOceanWaveState.storms = globalOceanWaveState.storms.filter(s => s.age < 80);

                // Bipolar ocean: smoothly interpolate between extreme and chill states
                globalOceanWaveState.timer -= deltaTime;
                if (globalOceanWaveState.timer <= 0) {
                    // More extreme weather patterns
                    if (Math.random() < 0.6) { // 60% chance for storms vs 40% calm
                        // Extreme storm: very high amp and speed
                        globalOceanWaveState.targetAmp = 2.0 + Math.random() * 2.5; // Much more intense (was 1.2-1.9)
                        globalOceanWaveState.targetSpeed = 3.5 + Math.random() * 2.0; // Faster waves
                        globalOceanWaveState.stormIntensity = 0.8 + Math.random() * 0.2; // High storm intensity
                    } else {
                        // Brief calm: low amp and speed (shorter duration)
                        globalOceanWaveState.targetAmp = 0.3 + Math.random() * 0.4;
                        globalOceanWaveState.targetSpeed = 1.0 + Math.random() * 0.8;
                        globalOceanWaveState.stormIntensity = 0.1 + Math.random() * 0.2; // Low storm intensity
                    }
                    globalOceanWaveState.timer = 6 + Math.random() * 6; // Shorter cycles for more dynamic weather
                }
                // Faster interpolation for more dynamic weather changes
                globalOceanWaveState.amp += (globalOceanWaveState.targetAmp - globalOceanWaveState.amp) * deltaTime * 0.25;
                globalOceanWaveState.speed += (globalOceanWaveState.targetSpeed - globalOceanWaveState.speed) * deltaTime * 0.25;
                globalOceanWaveState.stormIntensity += (globalOceanWaveState.stormIntensity - globalOceanWaveState.stormIntensity) * deltaTime * 0.2;
                // Center ocean on player
                globalOcean.position.x = playerPawn.position.x;
                globalOcean.position.z = playerPawn.position.z;
                globalOcean.position.y = 20.0; // Match the mesh creation position
                globalOceanTime += deltaTime * globalOceanWaveState.speed;
                
                // Update window variables for ship synchronization
                window.globalOceanTime = globalOceanTime;
                window.globalOceanWaveState = globalOceanWaveState;
                
                const pos = globalOceanGeometry.attributes.position;
                const seg = globalOceanSegments;
                let t = globalOceanTime;
                let px = playerPawn.position.x;
                let pz = playerPawn.position.z;
                let size = globalOceanSize;
                function getLocalWaveMultiplier(x, z) {
                    // Storms: if inside a storm, use its amp
                    let localAmp = 1.0;
                    let swirlY = 0;
                    for (let storm of globalOceanWaveState.storms) {
                        const dx = x - storm.x;
                        const dz = z - storm.z;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist < storm.radius) {
                            // Smoother, more natural swirl
                            swirlY += Math.sin(storm.swirl + dist * 0.02) * storm.amp * (1 - dist / storm.radius) * 0.5;
                            localAmp = Math.max(localAmp, 1 + (storm.amp - 1) * (1 - dist / storm.radius));
                        }
                    }
                    // Example: Calm in center, wilder at edges
                    const dist = Math.sqrt(x * x + z * z);
                    let base = 1.0;
                    if (dist < 30) base = 0.7;
                    if (dist > 80) base = 1.5;
                    return base * localAmp + swirlY;
                }
                for (let xi = 0; xi <= seg; xi++) {
                    for (let zi = 0; zi <= seg; zi++) {
                        const idx = xi * (seg + 1) + zi;
                        const x = (xi - seg / 2) * (size / seg) + px;
                        const z = (zi - seg / 2) * (size / seg) + pz;
                        // Use local multiplier for mesh
                        let amp = globalOceanWaveState.amp;
                        let y = 0;
                        // Add storm/localized effect
                        y += Math.sin(0.09 * x + t * 0.7) * 1.2 * getLocalWaveMultiplier(x, z);
                        y += Math.cos(0.08 * z + t * 0.5) * 1.0 * getLocalWaveMultiplier(x, z);
                        y += Math.sin(0.07 * (x + z) + t * 0.3) * 0.7 * getLocalWaveMultiplier(x, z);
                        pos.setY(idx, y);
                        
                        // Skip dynamic color updates to prevent visibility issues
                        // The static depth colors set during creation are sufficient
                    }
                }
                pos.needsUpdate = true;
                // Skip color updates to prevent rendering issues
                globalOceanGeometry.computeVertexNormals();
            }
            // Broadcast our position to other players if we're in a complete lobby
            if (window.Network && window.Network.isInCompleteLobby && window.Network.isInCompleteLobby()) {
                // Create player state object
                const playerState = {
                    position: {
                        x: playerPawn.position.x,
                        y: playerPawn.position.y,
                        z: playerPawn.position.z
                    },
                    rotation: {
                        x: playerPawn.rotation.x,
                        y: playerPawn.rotation.y,
                        z: playerPawn.rotation.z
                    },
                    surgeActive: playerPawn.surgeActive || false
                };
                
                // Throttle network updates to avoid spam (send every ~100ms)
                const now = Date.now();
                if (!window.lastNetworkUpdate || now - window.lastNetworkUpdate > 100) {
                    window.Network.broadcastPlayerState(playerState);
                    window.lastNetworkUpdate = now;
                }
            }

            // Update red networked players (animate them smoothly)
            networkedPlayerManager.update(deltaTime, animationTime);

            // Broadcast terrain changes to other players if we're in a complete lobby
            if (window.Network && window.Network.isInCompleteLobby && window.Network.isInCompleteLobby() && terrainGenerator && typeof terrainGenerator.getTerrainChanges === 'function') {
                try {
                    // Get terrain changes from this frame
                    const terrainChanges = terrainGenerator.getTerrainChanges();
                    
                    // Only broadcast if there are actual changes and throttle to prevent spam
                    if (terrainChanges && (terrainChanges.newPlanes.length > 0 || terrainChanges.removedPlanes.length > 0)) {
                        // Throttle terrain broadcasts to prevent network spam (every 500ms for safety)
                        const now = Date.now();
                        if (!window.lastTerrainUpdate || now - window.lastTerrainUpdate > 500) {
                            // Limit the number of changes per broadcast
                            const maxChangesPerUpdate = 10;
                            const limitedChanges = {
                                newPlanes: terrainChanges.newPlanes.slice(0, maxChangesPerUpdate),
                                removedPlanes: terrainChanges.removedPlanes.slice(0, maxChangesPerUpdate)
                            };
                            
                            console.log(`[Game] Broadcasting terrain changes:`, limitedChanges);
                            window.Network.broadcastTerrainChanges(limitedChanges);
                            window.lastTerrainUpdate = now;
                        }
                    }
                } catch (error) {
                    console.error('[Game] Error during terrain broadcasting:', error);
                }
            }

            // Update all AI players
            aiPlayers.forEach(aiPlayer => {
                aiPlayer.updateAI(deltaTime, animationTime);
                // Generate planes around each AI (with safety check)
                if (terrainGenerator && typeof terrainGenerator.generateNeighboringPlanes === 'function') {
                    terrainGenerator.generateNeighboringPlanes(aiPlayer.position);
                }
            });

            // Generate new planes for both player and AI
            if (terrainGenerator && typeof terrainGenerator.generateNeighboringPlanes === 'function') {
                terrainGenerator.generateNeighboringPlanes(playerPawn.position);
                
                // Generate terrain around red networked players too
                try {
                    const networkedPlayerPositions = networkedPlayerManager.getAllPositions();
                    if (networkedPlayerPositions.length > 0 && networkedPlayerPositions.length < 10) { // Safety limit
                        networkedPlayerPositions.forEach(position => {
                            if (position && position.x !== undefined && position.z !== undefined) {
                                terrainGenerator.generateNeighboringPlanes(position);
                            }
                        });

                        // Remove distant planes (check distance to player, AIs, and networked players)
                        // Create a combined array of all entities for distance checking
                        const allEntities = [...aiPlayers];
                        networkedPlayerPositions.forEach(pos => {
                            if (pos && pos.x !== undefined && pos.z !== undefined) {
                                allEntities.push({ position: pos });
                            }
                        });
                        if (typeof terrainGenerator.removeDistantPlanes === 'function') {
                            terrainGenerator.removeDistantPlanes(playerPawn.position, allEntities);
                        }
                    } else {
                        // Fallback to just player and AI if networked players seem invalid
                        if (typeof terrainGenerator.removeDistantPlanes === 'function') {
                            terrainGenerator.removeDistantPlanes(playerPawn.position, aiPlayers);
                        }
                    }
                } catch (error) {
                    console.error('[Game] Error with networked player terrain:', error);
                    // Fallback to just player and AI terrain
                    if (typeof terrainGenerator.removeDistantPlanes === 'function') {
                        terrainGenerator.removeDistantPlanes(playerPawn.position, aiPlayers);
                    }
                }
            } else {
                console.warn('[Game] terrainGenerator not available or missing methods');
            }

            // Update camera based on mouse movement
            if (isPointerLocked && (mouseX !== 0 || mouseY !== 0)) {
                theta -= mouseX * thetaSensitivity;
                phi -= mouseY * phiSensitivity;
                phi = Math.max(0.1, Math.min(1.2, phi));
                theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                mouseX = 0;
                mouseY = 0;
            }

            // Update camera position
            const horizontalDistance = r * Math.cos(phi);
            camera.position.x = playerPawn.position.x + horizontalDistance * Math.sin(theta);
            camera.position.z = playerPawn.position.z + horizontalDistance * Math.cos(theta);
            camera.position.y = playerPawn.position.y + r * Math.sin(phi);
            camera.lookAt(playerPawn.position);
        }

        renderer.render(scene, camera);
    }
    animate(performance.now());

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}