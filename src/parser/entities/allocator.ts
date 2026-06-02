const BUFFER_SIZE = 128 * 1024; // 128 KB

function createAllocator(bufferSize = BUFFER_SIZE) {
	const buffers = [Buffer.alloc(bufferSize)];

	// Each block: { bufferIndex, offset, size, free }
	const blocks = [{ bufferIndex: 0, offset: 0, size: bufferSize, free: true }];

	function alloc(size: number) {
		if (size <= 0) throw new RangeError('size must be > 0');

		// First-fit search through free blocks
		let idx = blocks.findIndex(b => b.free && b.size >= size);
		if (idx === -1) {
			const newBufferSize = Math.max(bufferSize, size);
			const bufferIndex = buffers.push(Buffer.alloc(newBufferSize)) - 1;
			blocks.push({ bufferIndex, offset: 0, size: newBufferSize, free: true });
			idx = blocks.length - 1;
		}

		const block = blocks[idx]!;

		// Split the block if there is leftover space
		if (block.size > size) {
			blocks.splice(idx + 1, 0, {
				bufferIndex: block.bufferIndex,
				offset: block.offset + size,
				size: block.size - size,
				free: true
			});
		}

		block.size = size;
		block.free = false;

		const buffer = buffers[block.bufferIndex]!;
		const view = new Uint8Array(buffer.buffer, buffer.byteOffset + block.offset, size);
		view.fill(0);
		return view;
	}

	function free(view: Uint8Array) {
		if (!(view instanceof Uint8Array)) throw new TypeError('Expected a Uint8Array');

		const idx = blocks.findIndex(b => {
			const buffer = buffers[b.bufferIndex]!;
			return buffer.buffer === view.buffer && buffer.byteOffset + b.offset === view.byteOffset && !b.free;
		});
		if (idx === -1) throw new Error('Pointer not recognised or already freed');

		blocks[idx]!.free = true;

		if (
			idx + 1 < blocks.length &&
			blocks[idx + 1]!.free &&
			blocks[idx + 1]!.bufferIndex === blocks[idx]!.bufferIndex
		) {
			blocks[idx]!.size += blocks[idx + 1]!.size;
			blocks.splice(idx + 1, 1);
		}

		if (idx > 0 && blocks[idx - 1]!.free && blocks[idx - 1]!.bufferIndex === blocks[idx]!.bufferIndex) {
			blocks[idx - 1]!.size += blocks[idx]!.size;
			blocks.splice(idx, 1);
		}
	}

	function reset() {
		buffers.length = 1;
		buffers[0] = Buffer.alloc(bufferSize);
		blocks.length = 1;
		blocks[0] = { bufferIndex: 0, offset: 0, size: bufferSize, free: true };
	}

	function stats() {
		const used = blocks.filter(b => !b.free).reduce((s, b) => s + b.size, 0);
		const total = buffers.reduce((s, b) => s + b.byteLength, 0);
		return {
			totalBytes: total,
			usedBytes: used,
			freeBytes: total - used,
			blocks: blocks.length
		};
	}

	return { alloc, free, reset, stats };
}

export { createAllocator };
