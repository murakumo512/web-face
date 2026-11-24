import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Nama wajib diisi'],
      trim: true,
    },
    identifier: {
      type: String,
      trim: true,
      default: '',
    },
    department: {
      type: String,
      trim: true,
      default: 'Umum',
    },
    role: {
      type: String,
      trim: true,
      default: 'Anggota',
    },
    wilayah: {
      type: String,
      trim: true,
      default: '',
    },
    faceDescriptors: {
      type: [[Number]],
      default: [],
      validate: {
        validator(arr) {
          if (!Array.isArray(arr)) return false;
          const validSelf = arr.every(
            (desc) => Array.isArray(desc) && desc.length === 128 && desc.every((n) => Number.isFinite(n))
          );
          if (!validSelf) return false;
          if (arr.length > 0) return true;
          const sface = this?.sfaceDescriptors;
          return (
            Array.isArray(sface) &&
            sface.length > 0 &&
            sface.every((desc) => Array.isArray(desc) && desc.length === 128 && desc.every((n) => Number.isFinite(n)))
          );
        },
        message: 'Minimal satu descriptor wajah (128 angka valid) wajib ada',
      },
    },
    sfaceDescriptors: {
      type: [[Number]],
      default: [],
      validate: {
        validator(arr) {
          if (!Array.isArray(arr)) return false;
          return arr.every(
            (desc) => Array.isArray(desc) && desc.length === 128 && desc.every((n) => Number.isFinite(n))
          );
        },
        message: 'Setiap SFace descriptor harus berisi tepat 128 angka valid',
      },
    },
    photoBase64: {
      type: String,
      default: '',
    },
    workspace: {
      type: String,
      enum: ['piloting', 'gereja'],
      default: 'piloting',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ workspace: 1, name: 1 });
userSchema.index({ workspace: 1, isActive: 1 });

export const User = mongoose.model('User', userSchema);
