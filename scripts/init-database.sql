-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create wineries table
CREATE TABLE IF NOT EXISTS wineries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    phone VARCHAR(20),
    website VARCHAR(255),
    google_rating DECIMAL(2, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create visits table
CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    winery_id INTEGER REFERENCES wineries(id) ON DELETE CASCADE,
    winery_name VARCHAR(255) NOT NULL,
    winery_address TEXT NOT NULL,
    visit_date DATE NOT NULL,
    user_review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, winery_id)
);

-- Insert sample Finger Lakes wineries
INSERT INTO wineries (name, address, latitude, longitude, phone, website, google_rating) VALUES
('Dr. Konstantin Frank Winery', '9749 Middle Rd, Hammondsport, NY 14840', 42.4089, -77.2094, '(607) 868-4884', 'https://drfrankwines.com', 4.6),
('Chateau Lafayette Reneau', '5081 NY-414, Hector, NY 14841', 42.4756, -76.8739, '(607) 546-2062', 'https://clrwine.com', 4.4),
('Wagner Vineyards', '9322 NY-414, Lodi, NY 14860', 42.6089, -76.8267, '(607) 582-6450', 'https://wagnervineyards.com', 4.3),
('Ravines Wine Cellars', '1020 Keuka Lake Rd, Penn Yan, NY 14527', 42.6394, -77.0533, '(315) 536-4265', 'https://ravineswine.com', 4.5),
('Hermann J. Wiemer Vineyard', '3962 NY-14, Dundee, NY 14837', 42.5267, -76.9733, '(607) 243-7971', 'https://wiemer.com', 4.7),
('Fox Run Vineyards', '670 NY-14, Penn Yan, NY 14527', 42.6178, -77.0456, '(315) 536-4616', 'https://foxrunvineyards.com', 4.4);

-- Create demo user (password: 'password')
INSERT INTO users (name, email, password) VALUES
('Demo User', 'demo@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');
