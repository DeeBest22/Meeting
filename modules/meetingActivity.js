import mongoose from 'mongoose';

// Meeting Activity Schema
const meetingActivitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  meetingId: { type: String, required: true },
  meetingName: { type: String, required: true }, // Ensure this is required and properly stored
  type: { 
    type: String, 
    enum: ['created', 'joined', 'left', 'completed', 'scheduled', 'cancelled', 'missed'],
    required: true 
  },
  status: {
    type: String,
    enum: ['completed', 'scheduled', 'missed', 'cancelled', 'in-progress'],
    default: 'completed'
  },
  duration: { type: Number }, // Duration in minutes
  participants: [{ 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    joinedAt: Date,
    leftAt: Date
  }],
  startTime: { type: Date },
  endTime: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

const MeetingActivity = mongoose.model('MeetingActivity', meetingActivitySchema);

// Setup meeting activity functionality
export const setupMeetingActivity = (app, io) => {
  
  // Get recent activities for a user
  app.get('/api/recent-activities', async (req, res) => {
    try {
      const userId = req.session.userId || req.user?._id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const activities = await MeetingActivity.find({ userId })
        .populate('userId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .limit(10);

      // Format activities for display
      const formattedActivities = activities.map(activity => ({
        id: activity._id,
        meetingId: activity.meetingId,
        meetingName: activity.meetingName || 'Unnamed Meeting', // Fallback for unnamed meetings
        type: activity.type,
        status: activity.status,
        duration: activity.duration,
        participants: activity.participants,
        startTime: activity.startTime,
        endTime: activity.endTime,
        createdAt: activity.createdAt,
        userId: activity.userId
      }));

      res.json({ activities: formattedActivities });
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  // Get all activities for a user (with pagination)
  app.get('/api/activities', async (req, res) => {
    try {
      const userId = req.session.userId || req.user?._id;
      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const activities = await MeetingActivity.find({ userId })
        .populate('userId', 'firstName lastName profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await MeetingActivity.countDocuments({ userId });

      const formattedActivities = activities.map(activity => ({
        id: activity._id,
        meetingId: activity.meetingId,
        meetingName: activity.meetingName || 'Unnamed Meeting',
        type: activity.type,
        status: activity.status,
        duration: activity.duration,
        participants: activity.participants,
        startTime: activity.startTime,
        endTime: activity.endTime,
        createdAt: activity.createdAt,
        userId: activity.userId
      }));

      res.json({ 
        activities: formattedActivities,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching activities:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
    }
  });

  // Create a new meeting activity
  const createActivity = async (userId, meetingId, meetingName, type, additionalData = {}) => {
    try {
      const activity = new MeetingActivity({
        userId,
        meetingId,
        meetingName: meetingName || 'Unnamed Meeting', // Ensure we always have a meeting name
        type,
        ...additionalData
      });

      await activity.save();
      
      // Populate the user data for real-time updates
      await activity.populate('userId', 'firstName lastName profilePicture');
      
      return activity;
    } catch (error) {
      console.error('Error creating activity:', error);
      throw error;
    }
  };

  // Update an existing activity
  const updateActivity = async (activityId, updateData) => {
    try {
      const activity = await MeetingActivity.findByIdAndUpdate(
        activityId,
        updateData,
        { new: true }
      ).populate('userId', 'firstName lastName profilePicture');

      return activity;
    } catch (error) {
      console.error('Error updating activity:', error);
      throw error;
    }
  };

  // Socket handlers for real-time activity updates
  const setupSocketHandlers = (socket) => {
    // Handle meeting started
    socket.on('meeting-started', async (data) => {
      try {
        const { meetingId, meetingName, userId, startTime } = data;
        
        if (!meetingId || !userId) {
          console.error('Missing required data for meeting-started event');
          return;
        }

        const activity = await createActivity(userId, meetingId, meetingName, 'created', {
          status: 'in-progress',
          startTime: startTime || new Date()
        });

        // Emit to user's room
        socket.to(`user-${userId}`).emit('activity-updated', {
          type: 'meeting-started',
          activity: {
            id: activity._id,
            meetingId: activity.meetingId,
            meetingName: activity.meetingName,
            type: activity.type,
            status: activity.status,
            startTime: activity.startTime,
            createdAt: activity.createdAt,
            userId: activity.userId
          }
        });

      } catch (error) {
        console.error('Error handling meeting-started:', error);
      }
    });

    // Handle meeting completed
    socket.on('meeting-completed', async (data) => {
      try {
        const { meetingId, meetingName, userId, duration, participants, startTime, endTime } = data;
        
        if (!meetingId || !userId) {
          console.error('Missing required data for meeting-completed event');
          return;
        }
        
        console.log('Processing meeting completion:', { meetingId, meetingName, userId, duration });

        // Try to find existing activity first
        let activity = await MeetingActivity.findOne({ 
          userId, 
          meetingId, 
          type: 'created' 
        });

        if (activity) {
          // Update existing activity
          activity = await updateActivity(activity._id, {
            type: 'completed',
            status: 'completed',
            duration,
            participants,
            endTime: endTime || new Date(),
            meetingName: meetingName && meetingName !== 'Meeting Room' ? meetingName : activity.meetingName
          });
        } else {
          // Create new completed activity
          activity = await createActivity(userId, meetingId, meetingName, 'completed', {
            status: 'completed',
            duration,
            participants,
            startTime,
            endTime: endTime || new Date()
          });
        }
        
        console.log('Activity saved:', activity);

        // Emit to user's room
        socket.to(`user-${userId}`).emit('activity-updated', {
          type: 'meeting-completed',
          activity: {
            id: activity._id,
            meetingId: activity.meetingId,
            meetingName: activity.meetingName,
            type: activity.type,
            status: activity.status,
            duration: activity.duration,
            participants: activity.participants,
            startTime: activity.startTime,
            endTime: activity.endTime,
            createdAt: activity.createdAt,
            userId: activity.userId
          }
        });

      } catch (error) {
        console.error('Error handling meeting-completed:', error);
      }
    });

    // Handle user joining room for activity updates
    socket.on('join-user-room', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their activity room`);
    });

    // Handle disconnect
    const handleDisconnect = () => {
      // Clean up any room subscriptions if needed
      console.log('Activity socket disconnected:', socket.id);
    };

    return { handleDisconnect };
  };

  return {
    createActivity,
    updateActivity,
    setupSocketHandlers,
    MeetingActivity
  };
};