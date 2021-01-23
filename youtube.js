import dotenv from 'dotenv';
import { Client, Message, Permissions } from 'discord.js';
import { openLabBot } from './index.js';
import fs from 'fs';
import youtubedl from 'youtube-dl';

dotenv.config();

const voiceChannelId = "784544555827462168"; // official open lab general

export const playYouTubeAudio = async (msg) => {
    const splitMsg = msg.content.split(" ");
    console.log(splitMsg);

    if (splitMsg.length < 2) {
        msg.reply("you didn't pass in a YouTube video. The usage is as follows:\n" +
                "`!youtube <url>`");
    } else {
        try {
            youtubedl.getInfo(splitMsg[1], [], async (error, info) => {
                if (error) {
                    console.log(error);
                    msg.reply(`Oops! An error occurred when trying to find the video:\n\`\`\`\n${error.stderr}\n\`\`\``);
                    return;
                }
    
                const voiceChannel = msg.guild.channels.cache.get(voiceChannelId);
                const connection = await voiceChannel.join();
                const dispatcher = connection.play(info.url);
    
                dispatcher.on('start', () => {
                    console.log(`"${info.title}" is now playing!`);
                    msg.reply(`"${info.title}" is now playing!`);
                });
                
                dispatcher.on('finish', () => {
                    console.log(`"${info.title}" has finished playing!`);
                    msg.reply(`"${info.title}" has finished playing!`);
                    connection.disconnect();
                });
    
                dispatcher.on('error', (error) => {
                    console.log(error);
                    msg.reply(`Oops! An error occurred when trying to play the video:\n\`\`\`\n${error}\n\`\`\``);
                    connection.disconnect();
                })
            });
        } catch (error) {
            console.log(error);
            msg.reply(`Oops! An error occurred:\n\`\`\`\n${error}\n\`\`\``);
        }
    }   

    // Delete the message that created this channel
    msg.delete();
}
