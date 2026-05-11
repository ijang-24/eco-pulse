CREATE DATABASE IF NOT EXISTS eco_pulse;
USE eco_pulse;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    rt VARCHAR(10) NOT NULL,
    rw VARCHAR(10) NOT NULL,
    role ENUM('citizen', 'admin') DEFAULT 'citizen',
    total_points INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waste_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    waste_type ENUM('plastic', 'paper', 'metal', 'glass', 'organic') NOT NULL,
    weight DECIMAL(10, 2),
    photo_url VARCHAR(255),
    status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    points_earned INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS energy_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    energy_type ENUM('electricity', 'water') NOT NULL,
    usage_value DECIMAL(10, 2),
    period VARCHAR(20),
    points_earned INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS merchants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    category VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS rewards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    points_cost INT NOT NULL,
    FOREIGN KEY (merchant_id) REFERENCES merchants(id)
);
