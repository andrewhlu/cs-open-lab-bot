import dotenv from 'dotenv';
import { Client } from 'discord.js';
import { initHelpQueue, createNewHelpRequest, buildHelpRequest, addReactionToHelpRequest } from './help-queue.js';
import { createChannel, inviteToChannel } from './private-channels.js';
import { initRoles, addReactionRole } from './roles.js';
import { playYouTubeAudio } from './youtube.js';

dotenv.config();

export const openLabBot = new Client();

const serverId = process.env.SERVER_ID;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const botChannelId = process.env.BOT_CHANNEL_ID;
const helpQueueCategoryId = process.env.HELP_QUEUE_CATEGORY_ID;
const helpQueueChannelId = process.env.HELP_QUEUE_CHANNEL_ID;
const rolesMessageId = process.env.ROLES_MESSAGE_ID;

const commands = {
    "ping": {
        action: (msg) => {
            msg.reply("pong");
        },
        deleteCall: false
    },
    "create": {
        action: async (msg) => {
            await createChannel(msg);
        },
        deleteCall: true
    },
    "invite": {
        action: async (msg) => {
            await inviteToChannel(msg);
        },
        deleteCall: true
    },
    "youtube": {
        action: (msg) => {
            // msg.reply("YouTube Bot is disabled for now. Sorry!");
            playYouTubeAudio(msg);
        },
        deleteCall: true
    },
    "hr": {
        action: async (msg) => {
            await createNewHelpRequest(msg);
        },
        deleteCall: true
    }
};

openLabBot.on('ready', async () => {
    // Run any initialization functions here
    await initHelpQueue();
    await initRoles();

    console.log(`Logged in as ${openLabBot.user.tag}!`);
});

openLabBot.on('message', async (msg) => {
    // Filter out any bot messages. We don't want the bot to respond to itself!
    // Also filter out messages not from the open lab bot guild
    if (!msg.author.bot && msg.guild?.id === serverId) {
        // Check if this is a command
        if (msg.content.charAt(0) === "!") {
            const command = msg.content.split(" ")[0].substr(1);

            if (command in commands) {
                try {
                    commands[command].action(msg);
                } catch (error) {
                    console.log(error);
                    msg.reply("an error occurred! Check the console for details.");
                }

                if (commands[command].deleteCall) {
                    msg.delete();
                }
            } else {
                msg.reply("I didn't understand your command. Please try again!");
            }
        // Check if this is a message in response to a help queue builder
        } else if (msg.channel.parentID === helpQueueCategoryId) {
            await buildHelpRequest(msg);
        }
    }
});

openLabBot.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.message.channel.id === helpQueueChannelId) {
        addReactionToHelpRequest(reaction, user);
    } else if (reaction.message.id === rolesMessageId) {
        addReactionRole(reaction, user);
    }
});

openLabBot.login(process.env.BOT_TOKEN);
