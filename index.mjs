import { EC2Client, DescribeSnapshotsCommand, DescribeInstancesCommand, DeleteSnapshotCommand, DescribeVolumesCommand } from "@aws-sdk/client-ec2";

const ec2Client = new EC2Client();

export const handler = async (event, context) => {
    try {
        // Get all EBS snapshots
        const snapshotsResponse = await ec2Client.send(new DescribeSnapshotsCommand({ OwnerIds: ['self'] }));

        // Get all active EC2 instance IDs
        const instancesResponse = await ec2Client.send(new DescribeInstancesCommand({
            Filters: [{ Name: 'instance-state-name', Values: ['running'] }]
        }));

        const activeInstanceIds = new Set(
            instancesResponse.Reservations.flatMap(reservation =>
                reservation.Instances.map(instance => instance.InstanceId)
            )
        );

        // Iterate through each snapshot and delete if it's not attached to any volume or the volume is not attached to a running instance
        for (const snapshot of snapshotsResponse.Snapshots) {
            const snapshotId = snapshot.SnapshotId;
            const volumeId = snapshot.VolumeId;

            if (!volumeId) {
                // Delete the snapshot if it's not attached to any volume
                await ec2Client.send(new DeleteSnapshotCommand({ SnapshotId: snapshotId }));
                console.log(`Deleted EBS snapshot ${snapshotId} as it was not attached to any volume.`);
            } else {
                // Check if the volume still exists
                try {
                    const volumeResponse = await ec2Client.send(new DescribeVolumesCommand({ VolumeIds: [volumeId] }));
                    if (volumeResponse.Volumes[0].Attachments.length === 0) {
                        await ec2Client.send(new DeleteSnapshotCommand({ SnapshotId: snapshotId }));
                        console.log(`Deleted EBS snapshot ${snapshotId} as it was taken from a volume not attached to any running instance.`);
                    }
                } catch (error) {
                    if (error.name === 'InvalidVolume.NotFound') {
                        // The volume associated with the snapshot is not found (it might have been deleted)
                        await ec2Client.send(new DeleteSnapshotCommand({ SnapshotId: snapshotId }));
                        console.log(`Deleted EBS snapshot ${snapshotId} as its associated volume was not found.`);
                    } else {
                        throw error;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};