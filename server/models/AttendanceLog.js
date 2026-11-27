import mongoose from 'mongoose';

const attendanceLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    personName: {
      type: String,
      required: true,
      trim: true,
    },
    identifier: {
      type: String,
      default: '-',
      trim: true,
    },
    department: {
      type: String,
      default: '-',
      trim: true,
    },
    wilayah: {
      type: String,
      default: '',
      trim: true,
    },
    sessionLabel: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['REGISTERED', 'UNREGISTERED'],
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: ['ENTRY', 'PASS_THROUGH'],
      required: true,
    },
    confidence: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    distance: {
      type: Number,
      default: null,
    },
    snapshotBase64: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    workspace: {
      type: String,
      enum: ['piloting', 'gereja', 'testing'],
      default: 'piloting',
      index: true,
    },
    enteredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

attendanceLogSchema.index({ workspace: 1, dateKey: 1, status: 1, enteredAt: -1 });

export const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);
