-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "address_rt" VARCHAR(10),
    "address_rw" VARCHAR(10),
    "role" VARCHAR(20) NOT NULL DEFAULT 'citizen',
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "waste_type" VARCHAR(20) NOT NULL,
    "weight" DECIMAL(10,2) NOT NULL,
    "photo_url" VARCHAR(255),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "points_earned" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
