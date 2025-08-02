import * as THREE from 'https://cdn.skypack.dev/three@0.134.0';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.134.0/examples/jsm/loaders/GLTFLoader.js';
import { createStar } from './star.js';

function pseudoPerlinNoise(t, seed) {
    const a = Math.sin(t * 1.3 + seed) * 1.7;
    const b = Math.sin(t * 0.8 + seed * 1.2) * 1.2;
    const c = Math.sin(t * 2.1 + seed * 0.7) * 0.9;
    return (a + b + c) / 3;
}

// Calculate ocean surface height at given x,z coordinates (matches game.js exactly)
function calculateOceanHeight(x, z) {
    // Access the global ocean variables from game.js
    // These are the exact same variables used by the global ocean mesh
    const globalOceanTime = window.globalOceanTime || 0;
    const globalOceanWaveState = window.globalOceanWaveState || { 
        amp: 1.0, 
        speed: 1.0, 
        storms: [] 
    };
    
    // Base ocean level (matches game.js)
    let height = 20.0;
    
    // Apply the exact same wave calculation as in game.js
    const t = globalOceanTime;
    
    // Use the exact same getLocalWaveMultiplier function from game.js
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
    
    const waveMultiplier = getLocalWaveMultiplier(x, z);
    
    // Apply the exact wave formulas from game.js
    height += Math.sin(0.09 * x + t * 0.7) * 1.2 * waveMultiplier;
    height += Math.cos(0.08 * z + t * 0.5) * 1.0 * waveMultiplier;
    height += Math.sin(0.07 * (x + z) + t * 0.3) * 0.7 * waveMultiplier;
    
    return height;
}

export function createShipPawn(isAI = false, color = null) {
    // Determine color: custom color takes priority, then AI/human default
    let shipColor;
    if (color !== null) {
        shipColor = color;
    } else {
        shipColor = isAI ? 0xFF00FF : 0x00FFFF;  // Purple for AI, Cyan for human
    }
    
    const playerGroup = new THREE.Group();
    
    // Create procedural ship geometry as fallback
    console.log('Creating ship with Ship1.glb model and procedural fallback');
    
    // Create temporary placeholder while loading
    const placeholderGeometry = new THREE.BoxGeometry(2, 0.5, 4);
    const placeholderMaterial = new THREE.MeshLambertMaterial({ 
        color: shipColor,
        wireframe: true,
        transparent: true,
        opacity: 0.3
    });
    const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    placeholder.position.y = 0; // Position on water surface
    playerGroup.add(placeholder);
    
    // Try to load Ship1.glb first
    const loader = new GLTFLoader();
    loader.load(
        './Ship1.glb',
        (gltf) => {
            console.log('Ship1.glb loaded successfully');
            const shipModel = gltf.scene;
            
            // Remove placeholder
            playerGroup.remove(placeholder);
            
            // Configure and add the GLTF ship
            shipModel.scale.setScalar(1.0); // Adjust scale as needed
            shipModel.position.y = 0; // Position on water surface
            
            // Apply color tint to ship materials
            shipModel.traverse((child) => {
                if (child.isMesh && child.material) {
                    // Clone material to avoid affecting other instances
                    child.material = child.material.clone();
                    
                    // Apply color tint based on player type
                    const colorVector = new THREE.Color(shipColor);
                    if (child.material.color) {
                        child.material.color.lerp(colorVector, 0.2); // 20% color tint
                    }
                    
                    // Add slight emissive glow for visibility
                    if (child.material.emissive) {
                        child.material.emissive.copy(colorVector);
                        child.material.emissiveIntensity = 0.1;
                    }
                }
            });
            
            playerGroup.add(shipModel);
            playerGroup.shipModel = shipModel; // Store reference for animations
            
            console.log('Ship1.glb added to player group');
        },
        (progress) => {
            console.log('Loading Ship1.glb progress:', (progress.loaded / progress.total) * 100 + '%');
        },
        (error) => {
            console.error('Error loading Ship1.glb:', error);
            console.log('Using procedural ship geometry fallback');
            
            // Remove placeholder and create procedural ship
            playerGroup.remove(placeholder);
            
            // Create the procedural ship hull
            const shipGeometry = createFallbackShipGeometry();
            const shipMaterial = new THREE.MeshLambertMaterial({ 
                color: 0x8B4513, // Brown hull color
                emissive: new THREE.Color(shipColor),
                emissiveIntensity: 0.05
            });
            const shipMesh = new THREE.Mesh(shipGeometry, shipMaterial);
            shipMesh.position.y = 0; // Position on water surface
            playerGroup.add(shipMesh);
            
            // Add sailing ship details
            addShipDetails(playerGroup, shipColor);
            
            // Store ship reference for animations
            playerGroup.shipModel = shipMesh;
        }
    );

    // Create and add star to the player group (positioned above ship)
    const star = createStar(shipColor);
    star.position.y = 5.0; // Position star higher above ship
    playerGroup.add(star);

    // Ship motion variables for ocean movement
    let bobPhase = Math.random() * Math.PI * 2;
    let bobSpeed = 0.8 + Math.random() * 0.4;
    let bobAmplitude = 0.15 + Math.random() * 0.1;
    
    let rollPhase = Math.random() * Math.PI * 2;
    let rollSpeed = 0.6 + Math.random() * 0.3;
    let rollAmplitude = 0.05 + Math.random() * 0.03;
    
    let pitchPhase = Math.random() * Math.PI * 2;
    let pitchSpeed = 0.7 + Math.random() * 0.3;
    let pitchAmplitude = 0.03 + Math.random() * 0.02;

    // Add properties for game mechanics
    playerGroup.position.set(0, 20, 0); // Start at water level (ocean surface is at y=20)
    playerGroup.velocity = new THREE.Vector3();
    playerGroup.angularVelocity = 0;
    playerGroup.targetRotationY = 0;
    playerGroup.maxSpeed = 8;
    playerGroup.acceleration = 0.15;
    playerGroup.deceleration = 0.92;
    playerGroup.rotationSpeed = 0.035;
    playerGroup.angularDeceleration = 0.88;
    playerGroup.isAI = isAI;

    // Enhanced update function for ship movement on ocean
    playerGroup.update = function(deltaTime) {
        // Calculate the actual ocean surface height at the ship's position
        const oceanSurfaceY = calculateOceanHeight(this.position.x, this.position.z);
        
        // Attach ship directly to the ocean surface
        this.position.y = oceanSurfaceY;
        
        // Apply rolling and pitching to ship model based on local wave slope
        if (this.shipModel) {
            // Calculate wave slope for realistic ship tilting
            const sampleDistance = 2.0; // Sample points around ship for slope calculation
            const heightFront = calculateOceanHeight(this.position.x, this.position.z + sampleDistance);
            const heightBack = calculateOceanHeight(this.position.x, this.position.z - sampleDistance);
            const heightLeft = calculateOceanHeight(this.position.x - sampleDistance, this.position.z);
            const heightRight = calculateOceanHeight(this.position.x + sampleDistance, this.position.z);
            
            // Calculate pitch (front-back tilt) and roll (left-right tilt)
            const pitch = Math.atan2(heightFront - heightBack, sampleDistance * 2) * 0.5; // Reduce intensity
            const roll = Math.atan2(heightRight - heightLeft, sampleDistance * 2) * 0.5;
            
            // Apply natural ship motion based on wave slopes
            this.shipModel.rotation.x = pitch;
            this.shipModel.rotation.z = roll;
            
            // Add subtle additional bobbing for ship feel
            const time = Date.now() * 0.001;
            const bobOffset = Math.sin(time * 0.8) * 0.1;
            this.shipModel.position.y = bobOffset;
        }
        
        // Update angular velocity towards target
        const angleDiff = this.targetRotationY - this.rotation.y;
        const normalizedAngleDiff = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
        this.angularVelocity += normalizedAngleDiff * this.rotationSpeed;
        this.angularVelocity *= this.angularDeceleration;
        
        // Apply rotation
        this.rotation.y += this.angularVelocity;
        
        // Update velocity
        this.velocity.multiplyScalar(this.deceleration);
        
        // Apply velocity to position (but Y will be overridden by ocean surface)
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Recalculate ocean surface height after movement and reattach
        const newOceanSurfaceY = calculateOceanHeight(this.position.x, this.position.z);
        this.position.y = newOceanSurfaceY;
        
        // Clamp position to reasonable bounds
        this.position.x = Math.max(-2000, Math.min(2000, this.position.x));
        this.position.z = Math.max(-2000, Math.min(2000, this.position.z));
    };

    // Add keyboard controls for human players
    if (!isAI) {
        const keys = {};
        
        window.addEventListener('keydown', (event) => {
            keys[event.code] = true;
        });
        
        window.addEventListener('keyup', (event) => {
            keys[event.code] = false;
        });
        
        playerGroup.processInput = function() {
            const moveVector = new THREE.Vector3();
            
            if (keys['KeyW'] || keys['ArrowUp']) {
                moveVector.z -= 1;
            }
            if (keys['KeyS'] || keys['ArrowDown']) {
                moveVector.z += 1;
            }
            if (keys['KeyA'] || keys['ArrowLeft']) {
                this.targetRotationY += this.rotationSpeed * 2;
            }
            if (keys['KeyD'] || keys['ArrowRight']) {
                this.targetRotationY -= this.rotationSpeed * 2;
            }
            
            if (moveVector.length() > 0) {
                moveVector.normalize();
                moveVector.multiplyScalar(this.acceleration);
                
                // Apply rotation to movement vector
                moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation.y);
                
                this.velocity.add(moveVector);
                
                // Clamp velocity
                if (this.velocity.length() > this.maxSpeed) {
                    this.velocity.normalize().multiplyScalar(this.maxSpeed);
                }
            }
        };
    }

    return playerGroup;
}

// Create a procedural ship hull geometry
function createFallbackShipGeometry() {
    const hullGeometry = new THREE.BufferGeometry();
    const hullVertices = [];
    
    // Create a more detailed ship hull with proper boat shape
    // Bottom keel
    hullVertices.push(0, -0.5, -3);    // stern bottom
    hullVertices.push(0, -0.5, 3);     // bow bottom
    
    // Hull bottom sides
    hullVertices.push(-1.2, -0.4, -2.5); // stern bottom left
    hullVertices.push(1.2, -0.4, -2.5);  // stern bottom right
    hullVertices.push(-1.0, -0.3, 2.5);  // bow bottom left
    hullVertices.push(1.0, -0.3, 2.5);   // bow bottom right
    
    // Hull waterline
    hullVertices.push(-1.5, 0, -2);      // stern waterline left
    hullVertices.push(1.5, 0, -2);       // stern waterline right
    hullVertices.push(-1.2, 0.1, 2);     // bow waterline left
    hullVertices.push(1.2, 0.1, 2);      // bow waterline right
    
    // Deck level
    hullVertices.push(-1.3, 0.5, -1.5);  // stern deck left
    hullVertices.push(1.3, 0.5, -1.5);   // stern deck right
    hullVertices.push(-1.0, 0.6, 1.5);   // bow deck left
    hullVertices.push(1.0, 0.6, 1.5);    // bow deck right
    
    // Upper hull
    hullVertices.push(0, 0.7, -1.5);     // stern deck center
    hullVertices.push(0, 0.8, 1.5);      // bow deck center
    
    const hullVertexArray = new Float32Array(hullVertices);
    
    // Hull face indices for a proper ship shape
    const hullIndices = [
        // Bottom hull
        0, 2, 3, 0, 3, 1,
        1, 3, 5, 1, 5, 4,
        1, 4, 2, 1, 2, 0,
        
        // Lower sides
        2, 6, 7, 2, 7, 3,
        3, 7, 9, 3, 9, 5,
        5, 9, 8, 5, 8, 4,
        4, 8, 6, 4, 6, 2,
        
        // Upper sides
        6, 10, 11, 6, 11, 7,
        7, 11, 13, 7, 13, 9,
        9, 13, 12, 9, 12, 8,
        8, 12, 10, 8, 10, 6,
        
        // Deck
        10, 14, 11,
        11, 14, 15,
        11, 15, 13,
        13, 15, 12,
        12, 15, 14,
        12, 14, 10
    ];

    hullGeometry.setAttribute('position', new THREE.BufferAttribute(hullVertexArray, 3));
    hullGeometry.setIndex(hullIndices);
    hullGeometry.computeVertexNormals();
    
    return hullGeometry;
}

// Add sailing ship details (masts, sails, rigging)
function addShipDetails(shipGroup, shipColor) {
    // === MAIN MAST ===
    const mainMastGeometry = new THREE.CylinderGeometry(0.05, 0.08, 4, 8);
    const mastMaterial = new THREE.MeshLambertMaterial({ color: 0x654321 }); // Dark brown
    const mainMast = new THREE.Mesh(mainMastGeometry, mastMaterial);
    mainMast.position.set(0, 2.5, 0);
    shipGroup.add(mainMast);
    
    // === FORE MAST ===
    const foreMastGeometry = new THREE.CylinderGeometry(0.04, 0.06, 3, 8);
    const foreMast = new THREE.Mesh(foreMastGeometry, mastMaterial);
    foreMast.position.set(0, 2, 1.5);
    shipGroup.add(foreMast);
    
    // === MAIN SAIL ===
    const mainSailGeometry = new THREE.PlaneGeometry(2, 2.5);
    const sailMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xF5F5DC, // Beige
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        emissive: new THREE.Color(shipColor),
        emissiveIntensity: 0.02
    });
    const mainSail = new THREE.Mesh(mainSailGeometry, sailMaterial);
    mainSail.position.set(0, 3, -0.3);
    shipGroup.add(mainSail);
    
    // === FORE SAIL ===
    const foreSailGeometry = new THREE.PlaneGeometry(1.5, 2);
    const foreSail = new THREE.Mesh(foreSailGeometry, sailMaterial);
    foreSail.position.set(0, 2.5, 1.2);
    shipGroup.add(foreSail);
    
    // === JIB SAIL (triangular) ===
    const jibGeometry = new THREE.BufferGeometry();
    const jibVertices = new Float32Array([
        0, 0, 0,      // bottom point
        -0.8, 1.5, 0, // top left
        0.8, 1.5, 0   // top right
    ]);
    jibGeometry.setAttribute('position', new THREE.BufferAttribute(jibVertices, 3));
    jibGeometry.setIndex([0, 1, 2]);
    jibGeometry.computeVertexNormals();
    
    const jibSail = new THREE.Mesh(jibGeometry, sailMaterial);
    jibSail.position.set(0, 1.5, 2.5);
    shipGroup.add(jibSail);
    
    // === RIGGING (simple lines) ===
    const riggingMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
    
    // Main mast rigging
    const rigging1Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1, 4, 0),
        new THREE.Vector3(1, 4, 0)
    ]);
    const rigging1 = new THREE.Line(rigging1Geometry, riggingMaterial);
    shipGroup.add(rigging1);
    
    // Fore mast rigging
    const rigging2Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.8, 3, 1.5),
        new THREE.Vector3(0.8, 3, 1.5)
    ]);
    const rigging2 = new THREE.Line(rigging2Geometry, riggingMaterial);
    shipGroup.add(rigging2);
    
    // Stay lines (mast to bow/stern)
    const stay1Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 4.5, 0),
        new THREE.Vector3(0, 1, 3)
    ]);
    const stay1 = new THREE.Line(stay1Geometry, riggingMaterial);
    shipGroup.add(stay1);
    
    const stay2Geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 4.5, 0),
        new THREE.Vector3(0, 1, -2.5)
    ]);
    const stay2 = new THREE.Line(stay2Geometry, riggingMaterial);
    shipGroup.add(stay2);
    
    // === SHIP DETAILS ===
    // Rudder
    const rudderGeometry = new THREE.BoxGeometry(0.1, 1, 0.5);
    const rudderMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
    const rudder = new THREE.Mesh(rudderGeometry, rudderMaterial);
    rudder.position.set(0, 0, -3.2);
    shipGroup.add(rudder);
    
    // Bowsprit
    const bowspritGeometry = new THREE.CylinderGeometry(0.03, 0.04, 1.5, 6);
    const bowsprit = new THREE.Mesh(bowspritGeometry, mastMaterial);
    bowsprit.rotation.x = Math.PI / 6; // Angle upward
    bowsprit.position.set(0, 1.2, 3.5);
    shipGroup.add(bowsprit);
    
    // Ship flags with player color
    const flagGeometry = new THREE.PlaneGeometry(0.5, 0.3);
    const flagMaterial = new THREE.MeshLambertMaterial({ 
        color: shipColor,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(shipColor),
        emissiveIntensity: 0.3
    });
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.set(0, 4.5, 0);
    shipGroup.add(flag);
}
