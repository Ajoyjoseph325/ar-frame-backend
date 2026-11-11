-- ==============================================================================
-- Cloudflare D1 Database Schema & Seed Script: aframebuilders
-- ==============================================================================

-- 1. CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_name TEXT NOT NULL UNIQUE
);

-- Seed Categories
INSERT OR IGNORE INTO categories (id, category_name) VALUES
    (1, 'Commercial'),
    (2, 'Luxury Villas'),
    (3, 'Interiors');

-- 2. USERS TABLE (Admin Authentication)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
);

-- Seed Admin User
INSERT OR IGNORE INTO users (id, username, password) VALUES
    (1, 'admin', 'admin');

-- 3. PROJECTS TABLE
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    project_name TEXT NOT NULL,
    project_image TEXT,
    images TEXT,
    client TEXT,
    location TEXT,
    builtup_area TEXT,
    land_area TEXT,
    description TEXT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- 4. DESIGN EXCELLENCE TABLE
CREATE TABLE IF NOT EXISTS design_excellence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    excellence_name TEXT NOT NULL,
    excellence_description TEXT NOT NULL,
    excellence_image TEXT
);

-- Seed Design Excellence
INSERT OR IGNORE INTO design_excellence (id, excellence_name, excellence_description, excellence_image) VALUES
    (1, 'Architecture Services', 'Innovative architectural planning and sustainable design built around modern luxury.', 'designexcellence/Finished Project.jpg'),
    (2, 'Interior Design', 'Refined bespoke interior styling, functional floor plans, and ambient illumination.', 'designexcellence/3D Visualization.jpg'),
    (3, 'Exterior Design', 'Landscape architecture, outdoor terraces, and sculpted facades that harmonise with nature.', 'designexcellence/Concept Sketch.jpg');

-- 5. HERO IMAGES TABLE
CREATE TABLE IF NOT EXISTS hero_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page TEXT NOT NULL DEFAULT 'home',
    image_url TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_first INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Hero Images
INSERT OR IGNORE INTO hero_images (id, page, image_url, display_order, is_first) VALUES
    (1, 'home', 'Heroimages/home_1789756586131_3.jpg', 0, 1),
    (2, 'home', 'Heroimages/home_1789756583938_0.jpg', 1, 0),
    (3, 'home', 'Heroimages/home_1789756587667_4.jpg', 2, 0),
    (4, 'projects', 'Heroimages/projects_1790996795722.png', 0, 1),
    (5, 'about', 'Heroimages/about_1790050332958.jpg', 0, 1),
    (6, 'contact', 'Heroimages/contact_1790050333611.jpg', 0, 1);

-- 6. BEFORE & AFTER TRANSFORMATION TABLE
CREATE TABLE IF NOT EXISTS before_after (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Home Renovation',
    location TEXT,
    year TEXT,
    before_image TEXT NOT NULL,
    after_image TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Before & After
INSERT OR IGNORE INTO before_after (id, title, category, location, year, before_image, after_image, display_order) VALUES
    (1, 'Heritage Villa Revival', 'Home Renovation', 'Thrissur, Kerala', '2025', 'beforeandafter/beforea1.jpg', 'beforeandafter/beoforea2.jpg', 0),
    (2, 'Modern Minimalist Facade', 'Exterior Architecture', 'Kochi, Kerala', '2026', 'beforeandafter/beforeb1.jpg', 'beforeandafter/beforeb2.jpg', 1),
    (3, 'Urban Penthouse Living Space', 'Interior Transformation', 'Calicut, Kerala', '2026', 'beforeandafter/penthouse_before.jpg', 'beforeandafter/penthouse_after.jpg', 2);

-- 7. PROPOSED & ONGOING PROJECTS TABLE
CREATE TABLE IF NOT EXISTS proposed_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT,
    image TEXT NOT NULL,
    gallery TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Proposed & Ongoing Projects
INSERT OR IGNORE INTO proposed_projects (id, title, subtitle, image, gallery) VALUES
    (1, 'Concept Sketch', 'Architectural Blueprint & Spatial Massing', 'proposed/proposed_1792931851292_xduwg.jpg', '["proposed/proposed_1792931851292_xduwg.jpg"]'),
    (2, '3D Visualization', 'High-Fidelity Architectural 3D Rendering', 'proposed/proposed_1792931862885_2mq5g.jpg', '["proposed/proposed_1792931862885_2mq5g.jpg"]'),
    (3, 'Finished Project', 'Turn-Key Architectural Construction Handover', 'proposed/proposed_1792931873763_fdwe0.jpg', '["proposed/proposed_1792931873763_fdwe0.jpg"]');

-- 8. GALLERY SHOWCASE TABLE
CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Architecture',
    image TEXT NOT NULL,
    aspect TEXT DEFAULT 'tall',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed Gallery Items
INSERT OR IGNORE INTO gallery (id, title, category, image, aspect, display_order) VALUES
    (1, 'Minimalist Monolith Villa', 'Architecture', 'gallery/gallery_1_minimalist_villa.jpg', 'tall', 1),
    (2, 'Nordic Light Living Lounge', 'Interior', 'gallery/gallery_2_nordic_lounge.jpg', 'wide', 2),
    (3, 'Glass Pavilion Horizon', 'Architecture', 'gallery/gallery_3_glass_pavilion.jpg', 'tall', 3),
    (4, 'Artisan Walnut Dining Space', 'Interior', 'gallery/gallery_4_walnut_dining.jpg', 'square', 4),
    (5, 'Brutalist Concrete Residence', 'Exterior', 'gallery/gallery_5_concrete_residence.jpg', 'wide', 5),
    (6, 'Double-Height Timber Void', 'Interior', 'gallery/gallery_6_timber_void.jpg', 'tall', 6),
    (7, 'Cantilever Coastal Retreat', 'Architecture', 'gallery/gallery_7_coastal_retreat.jpg', 'square', 7),
    (8, 'Zen Courtyard & Infinity Deck', 'Exterior', 'gallery/gallery_8_zen_courtyard.jpg', 'wide', 8),
    (9, 'Modern Geometric Facade', 'Architecture', 'gallery/gallery_9_geometric_facade.jpg', 'tall', 9),
    (10, 'Sculptural Marble Kitchen Island', 'Interior', 'gallery/gallery_10_marble_kitchen.jpg', 'square', 10),
    (11, 'Bespoke Twilight Terrace', 'Exterior', 'gallery/gallery_11_twilight_terrace.jpg', 'wide', 11),
    (12, 'Contemporary Linear Suite', 'Interior', 'gallery/gallery_12_linear_suite.jpg', 'tall', 12);


